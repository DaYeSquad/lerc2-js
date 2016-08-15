var lercRaster = require("./lib/LercRaster.js");
var fs = require("fs");
var lercData = fs.readFileSync("./test.lerc");
var arrayBuffer = new Uint8Array(lercData).buffer;
var parseData = lercRaster.decode(arrayBuffer);
// console.log(parseData);
