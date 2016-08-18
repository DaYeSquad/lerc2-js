"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

// bitstuff2.js
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

var BitStuff2 = exports.BitStuff2 = function () {
  function BitStuff2(buffer) {
    _classCallCheck(this, BitStuff2);

    this.buffer_ = buffer;
    this.lerc2Version_ = 0;
    this.fp_ = 0;
  }

  _createClass(BitStuff2, [{
    key: "setLerc2Version",
    value: function setLerc2Version(lerc2Version) {
      this.lerc2Version_ = lerc2Version;
    }
  }, {
    key: "setFilePosition",
    value: function setFilePosition(fp) {
      this.fp_ = fp;
    }
  }, {
    key: "decode",
    value: function decode() {
      var dataArray = new Uint8Array(0);

      var numBitsByte = this.buffer_[this.fp_];
      this.fp_++;

      var bits67 = numBitsByte >> 6;
      var n = bits67 == 0 ? 4 : 3 - bits67;

      var doLut = numBitsByte & 1 << 5 ? true : false; // bit 5
      numBitsByte &= 31; // bits 0-4;

      var numElements = this.decodeUInt_(n);
      var numBits = numBitsByte;
      if (!doLut) {
        if (numBits > 0) {
          if (this.lerc2Version_ >= 3) {
            dataArray = this.unstuff_(numElements, numBits);
          } else {
            throw "BitStuff2 decode failed because of unsupported lerc2 version (we are supporting version 3 and later";
          }
        }
      } else {
        var nLutByte = this.buffer_[this.fp_];
        this.fp_++;

        var nLut = nLutByte - 1;
        var tmpLutArray;
        if (this.lerc2Version_ >= 3) {
          tmpLutArray = this.unstuff_(nLut, numBits); // unstuff lut w/o the 0
        } else {
          throw "BitStuff2 decode failed because of unsupported lerc2 version";
        }

        var nBitsLut = 0;
        while (nLut >> nBitsLut) {
          nBitsLut++;
        }

        if (this.lerc2Version_ >= 3) {
          dataArray = this.unstuff_(numElements, nBitsLut); // unstuff indexes
        }

        // replace indexes by values
        var tmpLutArray2 = new Uint8Array(tmpLutArray.length + 1);
        tmpLutArray2[0] = 0;
        for (var i = 0; i < numElements; i++) {
          tmpLutArray2[i + 1] = tmpLutArray[i];
        }
        for (var i = 0; i < numElements; i++) {
          dataArray[i] = tmpLutArray2[dataArray[i]];
        }
      }

      return { data: dataArray, filePosition: this.fp_ };
    }
  }, {
    key: "decodeUInt_",
    value: function decodeUInt_(numFixedLengthValue) {
      var numElements = 0;

      if (numFixedLengthValue === 1) {
        numElements = this.buffer_[this.fp_];
      } else if (numFixedLengthValue === 2) {
        var dv = new DataView(this.buffer_);
        numElements = dv.getUint16(this.fp_);
      } else if (numFixedLengthValue === 4) {
        var dv = new DataView(this.buffer_);
        numElements = dv.getUint32(this.fp_);
      } else {
        throw "BitStuff2 DecodeUInt failed";
      }

      this.fp_ += numFixedLengthValue;
      return numElements;
    }
  }, {
    key: "unstuff_",
    value: function unstuff_(numElements, numBits) {
      var dataArray = new Uint8Array(numElements);

      var numUInts = parseInt((numElements * numBits + 31) / 32);
      var numBytes = numUInts * 4;

      var bitStuffArray = new Uint8Array(numUInts);
      bitStuffArray[numUInts - 1] = 0; // set last uint to 0

      // copy the bytes from the incoming byte stream
      var numBytesUsed = numBytes - this.numTailBytesNotNeeded_(numElements, numBits);
      for (var i = 0; i < numBytesUsed; i++) {
        bitStuffArray[i] = this.buffer_[this.fp_ + i];
      }

      // do the un-stuffing
      var srcPos = 0;
      var dstPos = 0;
      var bitPos = 0;
      var nb = 32 - numBits;

      for (var i = 0; i < numElements; i++) {
        if (nb - bitPos >= 0) {
          dataArray[dstPos++] = bitStuffArray[srcPos] << nb - bitPos >> nb;
          bitPos += numBits;
          if (bitPos === 32) {
            // shift >= 32 is undefined
            srcPos++;
            bitPos = 0;
          }
        } else {
          dataArray[dstPos] = bitStuffArray[srcPos++] >> bitPos;
          dataArray[dstPos++] |= bitStuffArray[srcPos] << 64 - numBits - bitPos >> nb;
          bitPos -= nb;
        }
      }

      this.fp_ += numBytesUsed;
      return dataArray;
    }
  }, {
    key: "numTailBytesNotNeeded_",
    value: function numTailBytesNotNeeded_(numElements, numBits) {
      var numBitsTail = numElements * numBits & 31;
      var numBytesTail = numBitsTail + 7 >> 3;
      return numBytesTail > 0 ? 4 - numBytesTail : 0;
    }
  }]);

  return BitStuff2;
}();
//# sourceMappingURL=bitstuff2.js.map
