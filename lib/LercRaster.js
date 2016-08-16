// LercRaster.js
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

var LERC = require("./LercCodecV2.js").Lerc

  var LercRaster = {
    decode: function (encodedData, options) {
      var iPlane = 0, inputOffset = 0, eof = encodedData.byteLength - 10, encodedMaskData;
      var decodedPixelBlock = {
        width: 0,
        height: 0,
        pixels: [],
        pixelType: options ? options.pixelType : null,
        mask: null,
        statistics: []
      };

      var lerc = LERC();
      while (inputOffset < eof) {
        var result = lerc.decode(encodedData);

        inputOffset = result.fileInfo.eofOffset;
        if (iPlane === 0) {
          decodedPixelBlock.width = result.width;
          decodedPixelBlock.height = result.height;
        }

        iPlane++;
        decodedPixelBlock.pixels.push(result.pixelData),
        decodedPixelBlock.statistics.push({
          minValue: result.minValue,
          maxValue: result.maxValue,
          noDataValue: result.noDataValue
        });
      }
      return decodedPixelBlock;
    }
  };

module.exports = LercRaster;
