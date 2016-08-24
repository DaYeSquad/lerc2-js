// bitstuff2.ts
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
  data: Uint32Array;
  filePosition: number;
}

/**
 * BitStuff2 is a TypeScript migration from esri/lerc C++ implementation.
 * Warning: We are only going to support lerc2 version 3 and later.
 */
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
    var dataArray: Uint32Array = new Uint32Array(0);

    var numBitsByte: number = this.buffer_[this.fp_];
    this.fp_++;

    var bits67: number = numBitsByte >>> 6;
    var n: number = (bits67 === 0) ? 4 : 3 - bits67;

    var doLut: boolean = (numBitsByte & (1 << 5)) ? true : false;    // bit 5
    numBitsByte &= 31;    // bits 0-4;

    var numElements: number = this.decodeUInt_(n);

    var numBits: number = numBitsByte;
    if (!doLut) {
      if (numBits > 0) {
        if (this.lerc2Version_ >= 3) {
          dataArray = this.unstuff_(numElements, numBits);
        } else {
          throw "BitStuff2 decode failed because of unsupported lerc2 version (we are supporting version 3 and later";
        }
      }
    } else {
      var nLutByte: number = this.buffer_[this.fp_];
      this.fp_++;

      var nLut: number = nLutByte - 1;
      var tmpLutArray: Uint32Array;
      if (this.lerc2Version_ >= 3) {
        tmpLutArray = this.unstuff_(nLut, numBits); // unstuff lut w/o the 0
      } else {
        throw "BitStuff2 decode failed because of unsupported lerc2 version";
      }

      var nBitsLut: number = 0;
      while (nLut >> nBitsLut) {
        nBitsLut++;
      }

      if (this.lerc2Version_ >= 3) {
        dataArray = this.unstuff_(numElements, nBitsLut); // unstuff indexes
      }

      // replace indexes by values
      var tmpLutArray2 = new Uint32Array(tmpLutArray.length + 1);
      tmpLutArray2[0] = 0;
      for (let i = 0; i < numElements; i++) {
        tmpLutArray2[i + 1] = tmpLutArray[i];
      }
      for (let i = 0; i < numElements; i++) {
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

  unstuff_(numElements: number, numBits: number): Uint32Array {
    let dataArray: Uint32Array = new Uint32Array(numElements);

    let numUInts: number = parseInt(<any>((numElements * numBits + 31) / 32)); // fake the typescript compiler
    let numBytes: number = numUInts * 4;

    let bitStuffDv: DataView = new DataView(new Uint32Array(numUInts).buffer);
    bitStuffDv.setUint32(numUInts * 4 - 4, 0, true); // set last uint to 0

    // copy the bytes from the incoming byte stream
    let numBytesUsed: number = numBytes - BitStuff2.numTailBytesNotNeeded_(numElements, numBits);
    for (let i = 0; i < numBytesUsed; i++) {
      bitStuffDv.setUint8(i, this.buffer_[this.fp_ + i]);
    }

    // do the un-stuffing
    let srcPos: number = 0;
    let dstPos: number = 0;
    let destDataView: DataView = new DataView(dataArray.buffer);

    let bitPos: number = 0;
    let nb: number = 32 - numBits;

    for (let i = 0; i < numElements; i++) {
      if (nb - bitPos >= 0) {
        let srcVal: number = bitStuffDv.getUint32(srcPos, true);

        let dstVal: number = (srcVal << (nb - bitPos)) >>> nb;
        destDataView.setUint32(dstPos, dstVal, true);
        dstPos += 4;
        bitPos += numBits;
        if (bitPos === 32) { // shift >= 32 is undefined
          srcPos += 4;
          bitPos = 0;
        }
      } else {
        let dstVal: number = bitStuffDv.getUint32(srcPos, true) >>> bitPos;
        destDataView.setUint32(dstPos, dstVal, true);
        srcPos += 4;

        let tmpVal: number = bitStuffDv.getUint32(srcPos, true) << (64 - numBits - bitPos) >>> nb;
        destDataView.setUint32(dstPos, dstVal |= tmpVal, true);
        dstPos += 4;
        bitPos -= nb;
      }
    }

    this.fp_ += numBytesUsed;
    return dataArray;
  }

  static numTailBytesNotNeeded_(numElements: number, numBits: number): number {
    let numBitsTail: number = (numElements * numBits) & 31;
    let numBytesTail: number = (numBitsTail + 7) >>> 3;
    return (numBytesTail > 0) ? 4 - numBytesTail : 0;
  }
}
