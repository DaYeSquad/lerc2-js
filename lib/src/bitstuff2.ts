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

export interface BitStuff2DecodeResult {
  data: Uint8Array;
  filePosition: number;
}

export class BitStuff2 {

  private lerc2Version_: number = 0;
  private buffer_: Uint8Array = undefined;
  private fp_: number = 0;

  constructor(buffer: Uint8Array) {
    this.buffer_ = buffer;
  }

  setLerc2Version(lerc2Version: number): void {
    this.lerc2Version_ = lerc2Version;
  }

  setFilePosition(fp: number): void {
    this.fp_ = fp;
  }

  decode(): BitStuff2DecodeResult {
    var dataArray = new Uint8Array(0);

    var numBitsByte = this.buffer_[this.fp_];
    this.fp_++;

    var bits67 = numBitsByte >> 6;
    var n = (bits67 == 0) ? 4 : 3 - bits67;

    var doLut = (numBitsByte & (1 << 5)) ? true : false;    // bit 5
    numBitsByte &= 31;    // bits 0-4;

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

    return {data: dataArray, filePosition: this.fp_};
  }

  decodeUInt_(numFixedLengthValue: number): number {
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

  unstuff_(numElements: number, numBits: number): Uint8Array {
    var dataArray = new Uint8Array(numElements);

    var numUInts = parseInt(<any>((numElements * numBits + 31) / 32)); // fake the typescript compiler
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
        dataArray[dstPos++] = (bitStuffArray[srcPos] << (nb - bitPos)) >> nb;
        bitPos += numBits;
        if (bitPos === 32) { // shift >= 32 is undefined
          srcPos++;
          bitPos = 0;
        }
      } else {
        dataArray[dstPos] = bitStuffArray[srcPos++] >> bitPos;
        dataArray[dstPos++] |= bitStuffArray[srcPos] << (64 - numBits - bitPos) >> nb;
        bitPos -= nb;
      }
    }

    this.fp_ += numBytesUsed;
    return dataArray;
  }

  numTailBytesNotNeeded_(numElements: number, numBits: number): number {
    var numBitsTail = (numElements * numBits) & 31;
    var numBytesTail = (numBitsTail + 7) >> 3;
    return (numBytesTail > 0) ? 4 - numBytesTail : 0;
  }
}
