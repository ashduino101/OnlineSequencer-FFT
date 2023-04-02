const resolution = 8;  // How many times to subdivide each 16th note, 4 means 64th notes
const fftSize = 2048;  // Must be power of 2 - 2048 is a good compromise for quality and bandwidth
const maxNotes = 1024;  // Maximum number of notes to add for each interval
const minIntensity = 108;  // Minimum volume for note to be added (0-255)
const repaintInterval = 100;  // Interval to repaint canvas
const playAudio = false;  // Whether to play the original audio while processing

autoScroll = '2'  // Disable autoscroll to prevent avoidable lag
loadInstrument(13);
loadInstrument(14);
loadInstrument(15);
loadInstrument(16);
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

      var time = 0;
      audioSourceL.start(0);
      audioSourceR.start(0);

      if (playAudio) {
        // Ensure panning is correct
        let panL = context.createStereoPanner();
        let panR = context.createStereoPanner();
        panL.pan.value = -1;
        panR.pan.value = 1;
        audioSourceL.connect(panL);
        audioSourceR.connect(panR);
        panL.connect(context.destination);
        panR.connect(context.destination);
      }

      async function processChannel(analyser, dataArray, inst, hsInst) {
        analyser.getByteFrequencyData(dataArray);

        var f = [];  // [index, amplitude]
        for (var i = 1; i < dataArray.length - 1; i++) {
          var isPeak = dataArray[i] >= dataArray[i - 1] && dataArray[i] >= dataArray[i + 1];
          if (isPeak) {
            f.push([i, dataArray[i]]);
          }
        }
        f.sort(function (a, b) {
          return b[1] - a[1]
        });
        i = 0;
        var added = 0;
        var s = "";
        while (added < maxNotes) {
          var frequency = f[i][0] * context.sampleRate / analyser.fftSize;
          var rawNote = Math.round((piano.length * Math.log(2) + 12 * Math.log(55 / frequency) + Math.log(4)) / (Math.log(2)) * 2) / 2;
          var shouldUseDt = (rawNote % 1 === 0.5);
          var note = piano[shouldUseDt ? Math.floor(rawNote) : Math.round(rawNote)];
          if (note != undefined && f[i][1] > minIntensity) {
            song.addNote(new Note(song, note, time, 1 / resolution + (1 / resolution * 0.1), shouldUseDt ? hsInst : inst, (f[i][1] - minIntensity) / (255 - minIntensity)));
            added++;
            s += "[" + note + " " + f[i][1] + "] ";
          }
          i++;
          if (i >= f.length) {
            break;
          }
        }
      }

      async function process() {
        time = timeInMsToTimeIndex(context.currentTime * 1000);

        await processChannel(analyserL, dataArrayL, 13, 15);
        await processChannel(analyserR, dataArrayR, 16, 14);

        window.setTimeout(process, song.sleepTime / resolution / 3);
      }
      process();
      // song.sleepTime / resolution
      const scrollId = window.setInterval(() => {
        SequencerView.repaint();
        setScrollLeft(time / resolution * noteWidth - clientWidth + 100, audioSystem.offline);
      }, repaintInterval);
    });
  }

  reader.readAsArrayBuffer(e.target.files[0]);
});

el.click();
