var resolution = 4; // how many times to subdivide each 16th note, 4 means 64th notes
var fftSize = 16384; // must be power of 2
var maxNotes = 1000; // maximum number of notes to add for each interval
var minIntensity = 116; // minimum volume for note to be added (0-255)
var repaintInterval = 100; // interval to repaint canvas
const octaveOffset = 4; // octave increase for high frequencies

instMgr.ensureLoaded(13);
instMgr.ensureLoaded(14);
instMgr.ensureLoaded(15);
instMgr.ensureLoaded(16);
var el = $('<input type="file" accept="audio/*">');
$(document.body).append(el);

el.on('change', function(e){
    var reader = new FileReader();
    reader.onload = function (e) {
        var context = new AudioContext();
        context.decodeAudioData(e.target.result, function(buffer){
            // Split the audio buffer into left and right channels
            var channelL = buffer.getChannelData(0);
            var channelR = buffer.getChannelData(1);

            // Create an AudioBuffer object from the Float32Array objects
            var audioBufferL = context.createBuffer(1, channelL.length, context.sampleRate);
            audioBufferL.getChannelData(0).set(channelL);
            var audioBufferR = context.createBuffer(1, channelR.length, context.sampleRate);
            audioBufferR.getChannelData(0).set(channelR);

            // Create an AudioBufferSourceNode object from the AudioBuffer object
            var audioSourceL = context.createBufferSource();
            audioSourceL.buffer = audioBufferL;
            audioSourceL.loop = false;
            var audioSourceR = context.createBufferSource();
            audioSourceR.buffer = audioBufferR;
            audioSourceR.loop = false;

            // Create AnalyserNodes
            var analyserL = context.createAnalyser();
            var analyserR = context.createAnalyser();
            analyserL.fftSize = analyserR.fftSize = fftSize;
            analyserL.smoothingTimeConstant = analyserR.smoothingTimeConstant = 0;
            analyserL.maxDecibels = analyserR.maxDecibels = 0;
            var bufferLength = analyserL.frequencyBinCount;
            var dataArrayL = new Uint8Array(bufferLength);
            var dataArrayR = new Uint8Array(bufferLength);

            // Connect the AudioBufferSourceNode objects to the AnalyserNode
            audioSourceL.connect(analyserL);
            audioSourceR.connect(analyserR);

            // Settings - basically, we have to make each as sinusoidal as possible
            // 13 - left
            // 16 - right
            // 15 - left high
            // 14 - right high

            // Normal
            // 13 - sine
            setPan(13, -1);
            // 16 - triangle
            setPan(16, 1);
            setEqHigh(16, -50);
            selectEq(16);
            setInitialInstrumentVolume(16, 1.5);

            // Higher
            // 15 - sawtooth
            setPan(15, -1);
            setEqHigh(15, -64);
            setEqLow(15, -10);
            selectEq(15);
            setInitialInstrumentVolume(15, 1.5);
            setDetune(15, octaveOffset * 12 * 100);
            // 14 - square
            setPan(14, 1);
            setEqHigh(14, -64);
            selectEq(14);
            setEqLow(14, -10);
            setInitialInstrumentVolume(14, 1.25);
            setDetune(14, octaveOffset * 12 * 100);

            var time = 0;
            audioSourceL.start(0);
            audioSourceR.start(0);
            setInterval(function(){
                // LEFT CHANNEL ------------------------
                analyserL.getByteFrequencyData(dataArrayL);

                var fL = []; // [index, amplitude]
                for (var i = 1; i < dataArrayL.length - 1; i++) {
                    var isPeak = dataArrayL[i] >= dataArrayL[i - 1] && dataArrayL[i] >= dataArrayL[i + 1];
                    if (isPeak) {
                        fL.push([i, dataArrayL[i]]);
                    }
                }
                fL.sort(function (a, b) {
                    return b[1] - a[1]
                });
                var i = 0;
                var added = 0;
                var s = "";
                while (added < maxNotes) {
                    var frequency = fL[i][0] * context.sampleRate / analyserL.fftSize;
                    var rawNote = Math.round((piano.length*Math.log(2)+12*Math.log(55/frequency)+Math.log(4))/(Math.log(2)));
                    var shouldUseHigher = (rawNote >= piano.length);
                    var note = piano[shouldUseHigher ? rawNote - (octaveOffset * 12) : Math.round(rawNote)];
                    if (note != undefined && fL[i][1] > minIntensity) {
                        song.addNote(new Note(song, note, time / resolution, 1 / resolution, shouldUseHigher ? 15 : 13, (fL[i][1] - minIntensity) / (255 - minIntensity)));
                        added++;
                        s += "[" + note + " " + fL[i][1] + "] ";
                    }
                    i++;
                    if (i >= fL.length) {
                        break;
                    }
                }

                // RIGHT CHANNEL -----------------------
                analyserR.getByteFrequencyData(dataArrayR);

                var fR = []; // [index, amplitude]
                for (var i = 1; i < dataArrayR.length - 1; i++) {
                    var isPeak = dataArrayR[i] >= dataArrayR[i - 1] && dataArrayR[i] >= dataArrayR[i + 1];
                    if (isPeak) {
                        fR.push([i, dataArrayR[i]]);
                    }
                }
                fR.sort(function (a, b) {
                    return b[1] - a[1]
                });
                var i = 0;
                var added = 0;
                var s = "";
                while (added < maxNotes) {
                    var frequency = fR[i][0] * context.sampleRate / analyserR.fftSize;
                    var rawNote = Math.round((piano.length*Math.log(2)+12*Math.log(55/frequency)+Math.log(4))/(Math.log(2)));
                    var shouldUseHigher = (rawNote >= piano.length);
                    var note = piano[shouldUseHigher ? rawNote - (octaveOffset * 12) : Math.round(rawNote)];
                    if (note != undefined && fR[i][1] > minIntensity) {
                        song.addNote(new Note(song, note, time / resolution, 1 / resolution, shouldUseHigher ? 14 : 16, (fR[i][1] - minIntensity) / (255 - minIntensity)));
                        added++;
                        s += "[" + note + " " + fR[i][1] + "] ";
                    }
                    i++;
                    if (i >= fR.length) {
                        break;
                    }
                }

                time++;
            }, song.sleepTime / resolution);
            setInterval(() => {
                SequencerView.repaint(kRepaintNotesMoved);
                setScrollLeft(time / resolution * noteWidth - clientWidth + 100, audioSystem.offline);
            }, repaintInterval)
        });
    }

    reader.readAsArrayBuffer(e.target.files[0]);
});

el.click();
