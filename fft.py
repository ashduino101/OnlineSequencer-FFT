import math
import os
import sys
import numpy
import random
import wave
import sequence_pb2
import dataclasses


def note_str(k):
    # A440 == 0 == A4
    k += (4 * 12) + 9
    return ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][k % 12] + str(k // 12)


def nearest_note(x):
    # x = 440 * 2 ^ (k / 12)
    # k = 12 * log2(x / 440)
    k = round(12 * math.log2(x / 440))
    return k


def note_to_freq(k):
    return 440 * math.pow(2, k / 12.0)


# Feel free to mess with these constants.
FREQUENCY_PROFILE_WINDOW_FREQ = 30
MINIMUM_VARIABLE_CHUNKS_PER_SECOND = 100
MAXIMUM_VARIABLE_CHUNKS_PER_SECOND = 400
USE_VARIABLE_CHUNKING = True
USE_RANDOM_CHUNKING = False
USE_BAND_BASED_CHUNKING = False
CUSTOM_FFT_MAXIMUM_CHUNKS_PER_SECOND = 400
FIXED_CHUNKS_PER_SECOND = 100
NUM_CRINGE_HARMONICS = 3
FREQUENCY_SMOOTHING = 0
TARGET_RMS_VOLUME = 0.3
MINIMUM_NOTE_VOLUME = 0.03
NUM_FREQUENCY_BANDS = 10
FREQUENCY_BAND_RANDOM_CHUNKING_THRESHOLD = 1000
TEMPO = 110

# Don't mess with these though.
MAXIMUM_NOTE = 38
MINIMUM_NOTE = -33
CUTOFF_FREQ = note_to_freq(MAXIMUM_NOTE + 1)

PIANO = [
    'C2', 'C#2', 'D2', 'D#2', 'E2', 'F2', 'F#2', 'G2', 'G#2', 'A2', 'A#2', 'B2', 'C3', 'C#3', 'D3', 'D#3',
    'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3', 'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4',
    'G#4', 'A4', 'A#4', 'B4', 'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5', 'F#5', 'G5', 'G#5', 'A5', 'A#5', 'B5',
    'C6', 'C#6', 'D6', 'D#6', 'E6', 'F6', 'F#6', 'G6', 'G#6', 'A6', 'A#6', 'B6', 'C7', 'C#7', 'D7', 'D#7',
    'E7', 'F7', 'F#7', 'G7', 'G#7', 'A7', 'A#7', 'B7'
]


def clamp(x):
    return min(max(x, -32768), 32767)


def time_in_ms_to_time_index(t):
    return t * 22 / 3000


def read_wav(wb):
    a = []
    wb = wb.readframes(w.getnframes())
    for i in range(0, len(wb), 2):
        a.append(int.from_bytes(wb[i: i + 2], byteorder="little", signed=True))
    return a


# [(frequency Hz, amplitude, phase radians)], constant offset
def fft(a, samp_freq, cutoff_freq=None):
    f = numpy.fft.rfft(a)
    qq = []
    for i in range(1, len(f)):
        m = numpy.absolute(f[i]) / len(f)
        t = numpy.angle(f[i]) - math.pi
        gg = i * math.pi / len(f)
        g = i * samp_freq / (2.0 * len(f))
        if cutoff_freq is not None and g > cutoff_freq:
            break
        qq.append((g, m, -t / gg))
    ot = numpy.angle(f[0])
    assert abs(math.sin(ot)) < 1e-6
    return qq, math.cos(ot) * numpy.absolute(f[0]) / len(f)


def smoothed_maximum_freq(qq):
    sq = [0] * len(qq)
    for i in range(len(qq)):
        n = 0
        m = 0
        for j in range(i - FREQUENCY_SMOOTHING, i + FREQUENCY_SMOOTHING + 1):
            if j < 0 or j >= len(qq):
                continue
            n += 1
            m += qq[j][1]
        sq[i] = m / n
    mm = -1
    mg = 0
    for i in range(len(sq)):
        if sq[i] > mm:
            mm = sq[i]
            mg = qq[i][0]
    return mm, mg


def frequency_profile(a, pos, samp_freq):
    samples_per_chunk_side = int(0.5 * samp_freq / FREQUENCY_PROFILE_WINDOW_FREQ)
    left = max(0, pos - samples_per_chunk_side)
    right = min(len(a) - 1, pos + samples_per_chunk_side)
    qq, _ = fft(a[left:right], samp_freq, CUTOFF_FREQ)
    return smoothed_maximum_freq(qq)


def merge_sines(a, ta, b, tb):
    c2 = a * a + b * b + 2 * a * b * math.cos(ta - tb)
    tantcy = a * math.sin(ta) + b * math.sin(tb)
    tantcx = a * math.cos(ta) + b * math.cos(tb)
    return math.sqrt(c2), math.atan2(tantcy, tantcx)


def add_note(qm, k, c, m, t):
    if (k, c) in qm:
        mm, tt = qm[(k, c)]
        qm[(k, c)] = merge_sines(mm, tt, m, t)
    else:
        qm[(k, c)] = (m, t)


def wrap_freq(f):
    while f < MINIMUM_VARIABLE_CHUNKS_PER_SECOND:
        f *= 2
    while f > MAXIMUM_VARIABLE_CHUNKS_PER_SECOND:
        f /= 2
    return f


def get_variable_chunk_size(a, j, samp_freq):
    mm, mg = frequency_profile(a, j, samp_freq)
    return wrap_freq(mg)


def get_random_chunk_size():
    return math.exp(random.uniform(
        math.log(MINIMUM_VARIABLE_CHUNKS_PER_SECOND),
        math.log(MAXIMUM_VARIABLE_CHUNKS_PER_SECOND)))


def handle_chunk(a, j, samp_freq, mf):
    mg = FIXED_CHUNKS_PER_SECOND
    if USE_BAND_BASED_CHUNKING:
        if mf > FREQUENCY_BAND_RANDOM_CHUNKING_THRESHOLD:
            mg = get_random_chunk_size()
        else:
            mg = get_variable_chunk_size(a, j, samp_freq)
    elif USE_VARIABLE_CHUNKING:
        mg = get_variable_chunk_size(a, j, samp_freq)
    elif USE_RANDOM_CHUNKING:
        mg = get_random_chunk_size()
    samples = int(samp_freq / mg)
    jj = j + samples
    aa = a[j: jj]
    aa += [0] * (samples - len(aa))
    qq, offset = fft(
        aa, samp_freq, None if NUM_CRINGE_HARMONICS > 0 else CUTOFF_FREQ)
    qm = {}
    for g, m, t in qq:
        k = nearest_note(g)
        if k < MINIMUM_NOTE:
            continue
        elif k <= MAXIMUM_NOTE:
            add_note(qm, k, False, m, t)
        else:
            for i in range(NUM_CRINGE_HARMONICS):
                h = 2 * i + 3
                k = nearest_note(g / h)
                if k <= MAXIMUM_NOTE:
                    add_note(qm, k, True, 0.1 * (m / NUM_CRINGE_HARMONICS) * h * h, t)
    q = []
    # o = [0 for _ in range(len(aa))]
    for kc, mt in qm.items():
        k, c = kc
        m, t = mt
        q.append((m, k, t, c))
        # for j in range(len(o) - int(t)):
        #   o[j + int(t)] += m * math.sin(noteToFreq(k) * j * 2 * math.pi / sampFreq)
    return q, len(aa)


def log_itr(f, n):
    for i in range(1, n):
        yield math.pow(f, i * 1.0 / n)
    yield f


def band_split(a, samp_freq):
    if NUM_FREQUENCY_BANDS < 2:
        return [a]
    f = numpy.fft.rfft(a)
    aa, pi = [], 0
    for i in log_itr(len(f), NUM_FREQUENCY_BANDS):
        ff = [f[j] if pi <= j < i else 0 for j in range(len(f))]
        mf = math.sqrt(pi * i) * samp_freq / len(f)
        aa.append((mf, [x for x in numpy.fft.irfft(ff, len(a))]))
        pi = i
    return aa


def output_wav(name, o, params):
    with wave.open(name, "wb") as wo:
        wo.setparams(params)
        wo.writeframes(b"".join([
            int(clamp(i)).to_bytes(2, byteorder='little', signed=True) for i in o]))


def progress(x, f):
    frames = w.getnframes()
    # x+1 just to make it 100%, not 99% awful, but it works
    sys.stdout.write('\r[About %d frames of %d, approximately %d%% done] ' % (f, frames, x))
    sys.stdout.flush()


def basic_fft(rawa, samp_freq):
    frames = w.getnframes()
    raw_data = []
    square_sum = 0
    aa = band_split(rawa, samp_freq)
    st = 1
    for mf, a in aa:
        print('\nProcessing band %d of %d' % (st, len(aa)))
        j = 0
        while j < len(a):
            percent_done = (j / frames) * 100
            progress(percent_done, j)
            qq, dj = handle_chunk(a, j, samp_freq, mf)
            j += dj
            for m, g, t, c in qq:
                square_sum += m * m
                raw_data.append((
                    note_str(g), m, j * 1000.0 / samp_freq, dj * 1000.0 / samp_freq, c, t))
        st += 1
    data = []
    rms = math.sqrt(square_sum / len(raw_data)) / TARGET_RMS_VOLUME
    for i in range(len(raw_data)):
        k, m, t, l, c, p = raw_data[i]
        m /= rms
        if m >= MINIMUM_NOTE_VOLUME:
            data.append((k, m, t, l, c))
    return data


def custom_fft_once(a, samp_freq, f):
    mr, mi, w = 0, 0, f * 2 * math.pi / samp_freq
    for j in range(len(a)):
        mr += a[j] * math.cos(w * j)
        mi -= a[j] * math.sin(w * j)
    return math.sqrt(mr * mr + mi * mi)


file_path = sys.argv[1] if len(sys.argv) > 1 else 'amogus.wav'

with wave.open(file_path, "rb") as w:
    sequence = sequence_pb2.Sequence()  # noqa
    sequence.settings.bpm = 110

    sequence.settings.instruments[13].volume = 1
    sequence.settings.instruments[13].delay = False
    sequence.settings.instruments[13].reverb = False

    sequence.settings.instruments[16].volume = 1
    sequence.settings.instruments[16].delay = False
    sequence.settings.instruments[16].reverb = False
    sequence.settings.instruments[16].pan = 0
    sequence.settings.instruments[16].pan = 0
    sequence.settings.instruments[16].enable_eq = True
    sequence.settings.instruments[16].eq_low = -48
    sequence.settings.instruments[16].eq_mid = -48
    sequence.settings.instruments[16].eq_high = 23

    name = os.path.basename(file_path)
    print('Frames:', w.getnframes())
    print('Sample Rate:', w.getframerate())
    print('Sample Width:', w.getsampwidth())
    print('Channels:', w.getnchannels())
    assert w.getnchannels() == 1
    assert w.getsampwidth() == 2
    samp_freq = w.getframerate()
    rawa = read_wav(w)
    data = basic_fft(rawa, samp_freq)
    print("%d notes" % len(data))

    for note in data:
        new_note = sequence_pb2.Note()  # noqa
        new_note.time = time_in_ms_to_time_index(note[2])
        new_note.type = PIANO.index(note[0]) + 24
        new_note.length = time_in_ms_to_time_index(note[3])
        new_note.instrument = 16 if note[4] else 13
        new_note.volume = note[1]
        sequence.notes.append(new_note)

    with open("%s.sequence" % name, "wb") as seq:
        seq.write(sequence.SerializeToString())
        print('Sequence written to %s.sequence.' % name)
