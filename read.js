// read.js
//
// Copyright (c) 2016 Frank Lin (lin.xiaoe.f@gmail.com)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

var Lerc2Decoder = require('./lib/src/lercdecoder2').Lerc2Decoder;

var fs = require("fs");

// var lercData = fs.readFileSync("./test.lerc2");
// var lercData = fs.readFileSync("/Users/FrankLin/Downloads/lerc2_test_dist/4/13/5.lerc");
var lercData = fs.readFileSync("/Users/FrankLin/Downloads/lerc2_test_dist/3/6/3.lerc");
var arrayBuffer = new Uint8Array(lercData).buffer;

var lerc2Decoder = new Lerc2Decoder(arrayBuffer);
var result = lerc2Decoder.parse();

// the test lerc is 256 * 256
var obj = JSON.parse(fs.readFileSync("data/test_int_tiff.json"));
var testIntValues = obj["values"];

var numNotEqual = 0;
var dv = new DataView(result.pixelData);
for (var i = 0; i < 256 * 256; i++) {
  var value = dv.getInt32(i * 4, true);
  if (value != testIntValues[i]) {
    console.log("index " + i + " is " + value);
    numNotEqual++;
  }
}
console.log("num not equal is " + numNotEqual);

console.log("DONE!");
