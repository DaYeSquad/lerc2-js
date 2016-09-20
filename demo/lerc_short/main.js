var Lerc2Decoder = require('../../lib/dist/lercdecoder2.js').Lerc2Decoder;

function drawImage() {
  var canvas = document.createElement('canvas');
  canvas.setAttribute('id', 'myCanvas');
  canvas.setAttribute('width', 256);
  canvas.setAttribute('height', 256);
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  var xmlhttp = new XMLHttpRequest();
  var url = "http://127.0.0.1:8080/lerc_short/data/test_short.lerc";

  xmlhttp.open("GET", url, true);
  xmlhttp.responseType = "arraybuffer";

  xmlhttp.onreadystatechange = function() {
    if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
      var arrayBuffer = xmlhttp.response;
      if (arrayBuffer) {
        var byteArray = new Uint8Array(arrayBuffer);

        var lerc2Decoder = new Lerc2Decoder(byteArray.buffer);
        var result = lerc2Decoder.parse(false);

        console.log(`width is ${result.width}, height is ${result.height}, type is ${result.dataType}`);

        var dv = new DataView(result.pixelData);

        var imgData = ctx.createImageData(256, 256); // width x height
        var data = imgData.data;

        var len = 256 * 256;

        // copy img byte-per-byte into our ImageData
        for (var i = 0; i < len; i++) {
          data[i * 4] = dv.getInt16(i * 2, true);
          data[i * 4 + 1] = dv.getInt16(i * 2, true);
          data[i * 4 + 2] = dv.getInt16(i * 2, true);
          data[i * 4 + 3] = 255;
        }

        // now we can draw our imagedata onto the canvas
        ctx.putImageData(imgData, 0, 0);
      }
    }
  };

  xmlhttp.send();
}

window.onload = function() {
  drawImage();
};
