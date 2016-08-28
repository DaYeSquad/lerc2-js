// test.js
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

var expect = require("chai").expect;
var Lerc2Decoder = require('../lib/dist/lercdecoder2').Lerc2Decoder;
var fs = require("fs");

describe("testLerc2IntValues()", function() {
  it("pixel values should equal to values in data/test_int.json", function() {
    var lercData = fs.readFileSync("data/test_int.lerc");
    var arrayBuffer = new Uint8Array(lercData).buffer;
    var lerc2Decoder = new Lerc2Decoder(arrayBuffer);
    var result = lerc2Decoder.parse();
    var obj = JSON.parse(fs.readFileSync("data/test_int.json"));
    var testIntValues = obj["values"];
    var numNotEqual = 0;
    var dv = new DataView(result.pixelData);
    for (var i = 0; i < result.pixelData.byteLength / 4; i++) {
      var value = dv.getInt32(i * 4, true);
      if (value != testIntValues[i]) {
        numNotEqual++;
      }
    }
    expect(numNotEqual).to.equal(0);
  });
});

describe("testLerc2ConstImageValues()", function() {
  it("pixel values should equal to values in data/test_float.json", function() {
    var lercData = fs.readFileSync("data/test_float.lerc");
    var arrayBuffer = new Uint8Array(lercData).buffer;
    var lerc2Decoder = new Lerc2Decoder(arrayBuffer);
    var result = lerc2Decoder.parse();
    var obj = JSON.parse(fs.readFileSync("data/test_float.json"));
    var testIntValues = obj["values"];
    var numNotEqual = 0;
    var dv = new DataView(result.pixelData);
    for (var i = 0; i < result.pixelData.byteLength / 4; i++) {
      var value = dv.getInt32(i * 4, true);
      if (value != testIntValues[i]) {
        numNotEqual++;
      }
    }
    expect(numNotEqual).to.equal(0);
  });
});

describe("testLerc2ByteValues()", function() {
  it("pixel values should equal to values in data/test_bytes.json", function() {
    var lercData = fs.readFileSync("data/test_bytes.lerc");
    var arrayBuffer = new Uint8Array(lercData).buffer;
    var lerc2Decoder = new Lerc2Decoder(arrayBuffer);
    var result = lerc2Decoder.parse();
    var obj = JSON.parse(fs.readFileSync("data/test_bytes.json"));
    var testIntValues = obj["values"];
    var numNotEqual = 0;
    var dv = new DataView(result.pixelData);
    for (var i = 0; i < result.pixelData.byteLength; i++) {
      var value = dv.getUint8(i);
      if (value != testIntValues[i]) {
        numNotEqual++;
      }
    }
    expect(numNotEqual).to.equal(0);
  });
});
