var resolution = 8; // how many times to subdivide each 1/4 note, 4 means 1/16 notes
var fftSize = 2048; // must be power of 2
var maxNotes = 1000; // maximum number of notes to add for each interval
var minIntensity = 110; // minimum volume for note to be added (0-255)

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
      var node = context.createAnalyser();
      node.fftSize = fftSize;
      node.smoothingTimeConstant = 0;
      node.maxDecibels = 0;
      var bufferLength = node.frequencyBinCount;
      var dataArray = new Uint8Array(bufferLength);
      var audioSource = context.createBufferSource();
      audioSource.buffer = buffer;
      audioSource.loop = false;
      audioSource.connect(node);

      // Settings
      setEqHigh(16, -50);
      selectEq(16);
      setInitialInstrumentVolume(16, 1.5);
      setDetune(16, -50);


      var time = 0;
      audioSource.start(0);
      setInterval(function(){
        node.getByteFrequencyData(dataArray);
        var f = []; // [index, amplitude]
        for (var i = 1; i < dataArray.length - 1; i++) {
          var isPeak = dataArray[i] >= dataArray[i-1] && dataArray[i] >= dataArray[i+1];
          if (isPeak) {
            f.push([i, dataArray[i]]);
          }
        }
        f.sort(function(a, b){return b[1] - a[1]});
        var i = 0;
        var added = 0;
        var s = "";
        while (added < maxNotes) {
          var frequency = f[i][0] * context.sampleRate / node.fftSize;
          var rawNote = Math.round((piano.length*Math.log(2)+12*Math.log(55/frequency)+Math.log(4))/(Math.log(2)) * 2) / 2;
          var shouldUseDt = (rawNote % 1 === 0.5);
          var note = piano[shouldUseDt ? Math.floor(rawNote) : Math.round(rawNote)];
          if (note != undefined && f[i][1] > minIntensity) {
            song.addNote(new Note(song, note, time/resolution, 1/resolution, shouldUseDt ? 16 : 13, (f[i][1]-minIntensity)/(255-minIntensity)));
            added++;
            s += "[" + note + " " + f[i][1] + "] ";
          }
          i++;
          if (i >= f.length) {
            break;
          }
        }
        time++;
      }, song.sleepTime/resolution);
      setInterval(SequencerView.repaint, 1000);
    });
  }

  reader.readAsArrayBuffer(e.target.files[0]);
});

el.click();