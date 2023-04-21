var resolution = 8; // how many times to subdivide each 16th note, 4 means 64th notes
var fftSize = 2048; // must be power of 2
var maxNotes = 1024; // maximum number of notes to add for each interval
var minIntensity = 108; // minimum volume for note to be added (0-255)
var repaintInterval = 100; // interval to repaint canvas

autoScroll = 2;

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
      // 13 - left 0ct
      // 16 - right 0ct
      // 15 - left 50ct
      // 14 - right 50ct

      // 13 - sine
      setPan(13, -1);
      // 16 - triangle
      setPan(16, 1);
      setEqHigh(16, -50);
      selectEq(16);
      setInitialInstrumentVolume(16, 1.5);
      // 15 - sawtooth
      setPan(15, -1);
      setEqHigh(15, -64);
      setEqLow(15, -10);
      selectEq(15);
      setInitialInstrumentVolume(15, 1.5);
      setDetune(15, -50);
      // 14 - square
      setPan(14, 1);
      setEqHigh(14, -64);
      selectEq(14);
      setEqLow(14, -10);
      setInitialInstrumentVolume(14, 1.25);
      setDetune(14, -50);

      let time = 0;
      audioSourceL.start(0);
      audioSourceR.start(0);

      function shuffle(a) {
        let j, x;
        for (let i = a.length - 1; i > 0; i--) {
          j = Math.floor(Math.random() * (i + 1));
          x = a[i];
          a[i] = a[j];
          a[j] = x;
        }
        return a;
      }

      function processChannel(analyser, dataArray, inst, hsInst) {
        analyser.getByteFrequencyData(dataArray);

        let f = [];  // [index, amplitude]
        for (let i = 1; i < dataArray.length - 1; i++) {
          let isPeak = dataArray[i] >= dataArray[i - 1] && dataArray[i] >= dataArray[i + 1];
          if (isPeak) {
            f.push([i, dataArray[i]]);
          }
        }
        f = shuffle(f);
        let i = 0;
        let added = 0;
        let column = {};
        while (added < maxNotes) {
          let frequency = f[i][0] * context.sampleRate / analyser.fftSize;
          let rawNote = Math.round((piano.length * Math.log(2) + 12 * Math.log(55 / frequency) + Math.log(4)) / (Math.log(2)) * 2) / 2;
          let shouldUseDt = (rawNote % 1 === 0.5);
          let noteIndex = shouldUseDt ? Math.floor(rawNote) : Math.round(rawNote);
          if (column[[noteIndex, shouldUseDt]]) continue;
          let note = piano[noteIndex];
          let volume = (f[i][1] - minIntensity) / (255 - minIntensity);
          let n = new Note(song, note, time / resolution, 1 / resolution + (1 / resolution * 0.1), shouldUseDt ? hsInst : inst, volume);
          if (note != undefined && f[i][1] > minIntensity) {
            song.addNote(n);
            column[noteIndex] = shouldUseDt;
            added++;
          }
          i++;
          if (i >= f.length) {
            break;
          }
        }
      }

      setInterval(function() {
        processChannel(analyserL, dataArrayL, 13, 15);
        processChannel(analyserR, dataArrayR, 16, 14);

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
