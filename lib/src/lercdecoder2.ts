// lercdecoder2.js
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

/// <reference path="../../typings/globals/mathjs/index.d.ts" />

import {BitStuff2, BitStuff2DecodeResult} from './bitstuff2';
import * as math from 'mathjs';
import BigNumber = mathjs.BigNumber;

enum Lerc2DataType {
  CHAR = 0,
  BYTE,
  SHORT,
  USHORT,
  INT,
  UINT,
  FLOAT,
  DOUBLE,
  UNDEFINED
}

export interface Lerc2HeaderInfo {
  fileIdentifierString: string;
  version: number;
  checksum: number;
  height: number;
  width: number;
  numValidPixel: number;
  microBlockSize: number;
  blobSize: number;
  lercDataType: Lerc2DataType;
  maxZError: number;
  zMin: number;
  zMax: number;
}

export interface Lerc2ParseResult {
  pixelData: ArrayBuffer;
}

export class Lerc2Decoder {
  private static FILE_KEY_ = "Lerc2 ";
  private buffer_: ArrayBuffer = undefined;
  private bufferDataView_: DataView = undefined;
  private fp_: number = 0;
  private headerInfo_: Lerc2HeaderInfo = <Lerc2HeaderInfo>{};
  private bitStuff2Util_: BitStuff2 = undefined;
  private pixelValuesDataView_: DataView = undefined;

  constructor(buffer: ArrayBuffer) {
    this.buffer_ = buffer;
    this.bitStuff2Util_ = new BitStuff2(new Uint8Array(buffer));
    this.bufferDataView_ = new DataView(this.buffer_);
  }

  parse(skipChecksum: boolean=true): Lerc2ParseResult {
    // parse header and set lerc2 version to bitStuff2
    this.readHeader_();
    this.bitStuff2Util_.setLerc2Version(this.headerInfo_.version);

    // You can safely skip this step.
    if (!skipChecksum) {
      if (!this.isChecksumMatch_())
        throw "Checksum is not matched";
    }

    this.pixelValuesDataView_ = new DataView(new Uint8Array(this.headerInfo_.height * this.headerInfo_.width * this.sizeofHeaderInfoDataType_()).buffer);
    for (let i = 0; i < this.headerInfo_.width * this.headerInfo_.height; i++) {
      this.setPixelValuesByHeaderInfoDataType_(i, 0);
    }

    if (this.headerInfo_.numValidPixel === 0)
      return;

    //TODO(lin.xiaoe.f@gmail.com): Read mask, assumes bit mask is all valid now.
    this.readMask_();

    if (this.headerInfo_.zMin === this.headerInfo_.zMax) { // image is const
      let z0: number = this.headerInfo_.zMin;
      for (let i = 0; i < this.headerInfo_.height; i++) {
        let k = i * this.headerInfo_.width;
        for (let j = 0; j < this.headerInfo_.width; j++) {
          //TODO(lin.xiaoe.f@gmail.com): if (m_bitMask.IsValid(k))
          this.setPixelValuesByHeaderInfoDataType_(k, z0);
        }
      }
      return { pixelData: this.pixelValuesDataView_.buffer };
    }

    var readDataOneSweepFlag = this.buffer_[this.fp_]; // read flag
    this.fp_++;

    if (readDataOneSweepFlag === 0) { // no binary data in one sweep
      this.readTiles_();
    } else {
      this.readDataOneSweep_();
    }

    return { pixelData: this.pixelValuesDataView_.buffer };
  }

  /**
   * Get LERC header info, including version, checksum, width, height, numValidPixel, microBlockSize, blobSize,
   * lercDataType, maxZError, zMin, zMax and move the file position to the mask block.
   *
   * @returns {{headerInfo}} LERC header information.
   */
  readHeader_(): void {
    // file header first 6 chars should be "Lerc2", byte offset is 0.
    var bytes = new Uint8Array(this.buffer_, 0, 6);
    this.headerInfo_.fileIdentifierString = String.fromCharCode.apply(null, bytes);
    if (this.headerInfo_.fileIdentifierString != Lerc2Decoder.FILE_KEY_) {
      throw "Unexpected file identifier string: " + this.headerInfo_.fileIdentifierString;
    }

    // lerc stores in little endian
    this.headerInfo_.version = this.bufferDataView_.getInt32(6, true);         // Int 4
    this.headerInfo_.checksum = this.bufferDataView_.getUint32(10, true);      // UInt 4
    this.headerInfo_.height = this.bufferDataView_.getInt32(14, true);         // Int 4
    this.headerInfo_.width = this.bufferDataView_.getInt32(18, true);          // Int 4
    this.headerInfo_.numValidPixel = this.bufferDataView_.getInt32(22, true);  // Int 4
    this.headerInfo_.microBlockSize = this.bufferDataView_.getInt32(26, true); // Int 4
    this.headerInfo_.blobSize = this.bufferDataView_.getInt32(30, true);       // Int 4
    this.headerInfo_.lercDataType = this.bufferDataView_.getInt32(34, true);   // Int 4
    this.headerInfo_.maxZError = this.bufferDataView_.getFloat64(38, true);    // Double 8
    this.headerInfo_.zMin = this.bufferDataView_.getFloat64(46, true);         // Double 8
    this.headerInfo_.zMax = this.bufferDataView_.getFloat64(54, true);         // Double 8

    this.fp_ += 62;
  }

  /**
   * Check checksum is match or not, returns true if match.
   * @returns {boolean} true if checksum is the same.
   */
  isChecksumMatch_(): boolean {
    if (this.headerInfo_.version >= 3) {
      var nChecksumFieldBytes = Lerc2Decoder.FILE_KEY_.length + 8; // start right after the checksum entry
      var checksum = this.computeChecksumFletcher32_(this.headerInfo_.blobSize - nChecksumFieldBytes);

      if (checksum != this.headerInfo_.checksum) {
        return false;
      }
    }
    return true;
  }

  /**
   * Fletcher's checksum with bytes. (https://en.wikipedia.org/wiki/Fletcher's_checksum)
   *
   * Warning, this implementation is super slow, you may want to improve this version by give eyes on
   * {@link computeChecksumFletcher32Wrong_} though this method now results out of INT_MAX error in process.
   *
   * @param len Buffer length.
   * @returns {number} Result.
   */
  computeChecksumFletcher32_(len: number): BigNumber {
    var lercBlobLen = len;

    var sum1 = math.bignumber(0xffff);
    var sum2 = math.bignumber(0xffff);
    var words = parseInt(<any>(lercBlobLen / 2)); // fake the typescript compiler

    var iByte = Lerc2Decoder.FILE_KEY_.length + 8; // start right after the checksum entry

    while (words) {
      var tlen = (words >= 359) ? 359 : words;
      words -= tlen;
      do {
        sum1 = math.sum(sum1, this.buffer_[iByte++] << 8);
        sum1 = math.sum(sum1, this.buffer_[iByte++]);
        sum2 = math.sum(sum1, sum2);
      } while (--tlen);

      sum1 = math.sum(math.bitAnd(sum1, 0xffff), math.rightArithShift(sum1, 16));
      sum2 = math.sum(math.bitAnd(sum2, 0xffff), math.rightArithShift(sum2, 16));
    }

    // add the straggler byte if it exists
    if (lercBlobLen & 1) {
      sum1 = math.sum(sum1, math.leftShift(this.buffer_[iByte], 8));
      sum2 = math.sum(sum1, sum2);
    }

    // second reduction step to reduce sums to 16 bits
    sum1 = math.sum(math.bitAnd(sum1, 0xffff), math.rightArithShift(sum1, 16));
    sum2 = math.sum(math.bitAnd(sum2, 0xffff), math.rightArithShift(sum2, 16));

    // sum2 << 16 | sum1 is greater than INT_MAX use math.js instead.
    var result = math.leftShift(sum2, 16);
    result = math.bitXor(result, sum1); // result = math.bitOr(result, sum1);

    return result;
  }

  /**
   * Fletcher's checksum with bytes. (https://en.wikipedia.org/wiki/Fletcher's_checksum)
   *
   * Warning, this implementation cannot work but much much much faster than the right one.
   *
   * @param len Buffer length.
   * @returns {number} Result.
   */
  computeChecksumFletcher32Wrong_(len: number): BigNumber {
    var lercBlobLen = len;

    var sum1 = 0xffff;
    var sum2 = 0xffff;
    var words = parseInt(String(lercBlobLen / 2));

    var iByte = 14;

    while(words) {
      var tlen = (words >= 359) ? 359 : words;
      words -= tlen;
      do {
        sum1 += (this.buffer_[iByte++] << 8);
        sum2 += sum1 += this.buffer_[iByte++];
      } while (--tlen);

      sum1 = (sum1 & 0xffff) + (sum1 >> 16);
      sum2 = (sum2 & 0xffff) + (sum2 >> 16);
    }

    // add the straggler byte if it exists
    if (lercBlobLen & 1) {
      sum2 += sum1 += (this.buffer_[iByte] << 8);
    }

    // second reduction step to reduce sums to 16 bits
    sum1 = (sum1 & 0xffff) + (sum1 >> 16);
    sum2 = (sum2 & 0xffff) + (sum2 >> 16);

    // sum2 << 16 | sum1 is greater than INT_MAX use math.js instead.
    var result = math.leftShift(math.bignumber(sum2), 16);
    result = math.bitXor(result, sum1); // result = math.bitOr(result, sum1);

    return result;
  }

  /**
   * Read the bit mask of LERC.
   * @private
   */
  readMask_(): void {
    var numValid = this.headerInfo_.numValidPixel;
    var width = this.headerInfo_.width;
    var height = this.headerInfo_.height;

    // get mask blob size in bytes
    var numBytesMask = this.bufferDataView_.getInt32(this.fp_, true);
    this.fp_ += 4;

    if ((numValid === 0 || numValid === width * height) && (numBytesMask != 0))
      throw "Read mask failed";

    if (numValid == 0) {
      //TODO(lin.xiaoe.f@gmail.com): Bit Mask is all invalid.
    } else if (numValid === width * height) {
      //TODO(lin.xiaoe.f@gmail.com): Bit Mask is all valid.
    } else if (numBytesMask > 0) {
      //TODO(lin.xiaoe.f@gmail.com): RLE decompress.
      console.log("Need RLE decompress");
      this.fp_ += numBytesMask;
    }
  }

  /**
   * Read pixel values.
   * @private
   */
  readTiles_(): void {
    if (this.headerInfo_.version > 1 &&
      (this.headerInfo_.lercDataType === Lerc2DataType.BYTE || this.headerInfo_.lercDataType === Lerc2DataType.CHAR) &&
      this.headerInfo_.maxZError === 0.5) {
      //TODO(lin.xiaoe.f@gmail.com): Try Huffman.
      //console.log("Try Huffman is not implemented yet");
    }

    var mbSize = this.headerInfo_.microBlockSize;
    var height = this.headerInfo_.height;
    var width = this.headerInfo_.width;

    var numTilesVertical = parseInt(<any>((height + mbSize - 1) / mbSize));
    var numTilesHorizontal = parseInt(<any>((width + mbSize - 1) / mbSize));

    for (var iTile = 0; iTile < numTilesVertical; iTile++) {
      var tileH = mbSize;
      var i0 = iTile * tileH;
      if (iTile == numTilesVertical - 1) {
        tileH = height - i0;
      }

      for (var jTile = 0; jTile < numTilesHorizontal; jTile++) {
        var tileW = mbSize;
        var j0 = jTile * tileW;
        if (jTile == numTilesHorizontal - 1)
          tileW = width - j0;

        this.readTile_(i0, i0 + tileH, j0, j0 + tileW);
      }
    }
  }

  /**
   * Read each block tile.
   * @param i0
   * @param i1
   * @param j0
   * @param j1
   * @private
   */
  readTile_(i0: number, i1: number, j0: number, j1: number): void {
    let ptr: number = this.fp_;
    let compareFlag: number = this.buffer_[ptr];
    ptr++;
    let numPixel: number = 0;

    let bits67: number = compareFlag >> 6;
    let testCode: number = (compareFlag >> 2) & 15; // use bits 2345 for integrity check
    if (testCode != ((j0 >> 3) & 15)) {
      throw "Read tile integrity check failed";
    }

    compareFlag &= 3;

    if (compareFlag === 2) { // entire tile is constant 0 (if valid or invalid doesn't matter)
      for (let i = i0; i < i1; i++) {
        let k: number = i * this.headerInfo_.width + j0;
        for (let j = j0; j < j1; j++, k++)
          //TODO(lin.xiaoe.f@gmail.com): if (m_bitMask.IsValid(k))
          this.setPixelValuesByHeaderInfoDataType_(k, 0);
      }
      this.fp_ = ptr;
      return;
    } else if (compareFlag === 0) { // read z's binary uncompressed
      let srcPtr: number = ptr;
      for (let i = i0; i < i1; i++) {
        let k: number = i * this.headerInfo_.width + j0;
        for (let j = j0; j < j1; j++, k++) {
          //TODO(lin.xiaoe.f@gmail.com): if (m_bitMask.IsValid(k))
          if (this.headerInfo_.lercDataType === Lerc2DataType.FLOAT) {
            this.setPixelValuesByHeaderInfoDataType_(k, this.bufferDataView_.getFloat32(srcPtr, true));
            srcPtr += 4;
          } else if (this.headerInfo_.lercDataType === Lerc2DataType.INT) {
            this.setPixelValuesByHeaderInfoDataType_(k, this.bufferDataView_.getInt32(srcPtr, true));
            srcPtr += 4;
          } else {
            throw "Lerc2DataType rather than FLOAT, INT is not supported yet";
          }
          numPixel++;
        }
      }
      ptr += numPixel * this.sizeofHeaderInfoDataType_();
    } else {
      // get variable data type and offset.
      let dataTypeUsed: Lerc2DataType = this.getDataTypeUsed_(bits67);
      let vdt: {offset: number, ptr: number} = this.readVariableDataType_(ptr, dataTypeUsed);
      let offset: number = vdt.offset;
      ptr = vdt.ptr;

      if (compareFlag === 3) {
        for (let i = i0; i < i1; i++) {
          let k: number = i * this.headerInfo_.width + j0;
          for (let j = j0; j < j1; j++, k++) {
            //TODO(lin.xiaoe.f@gmail.com): if (bitMask.IsValid(k))
            this.setPixelValuesByHeaderInfoDataType_(k, offset);
          }
        }
      } else {
        this.bitStuff2Util_.setFilePosition(ptr);
        let bitDecodeResult: BitStuff2DecodeResult = this.bitStuff2Util_.decode();

        let bufferArray: Uint32Array = bitDecodeResult.data;
        let bufferArrayDv: DataView = new DataView(bufferArray.buffer);
        ptr = bitDecodeResult.filePosition;

        let invScale: number = 2 * this.headerInfo_.maxZError;
        let srcPos: number = 0;

        if (bufferArray.length == (i1 - i0) * (j1 - j0)) { // all valid
          for (let i = i0; i < i1; i++) {
            let k: number = i * this.headerInfo_.width + j0;
            for (let j = j0; j < j1; j++, k++) {
              let z: number = offset + bufferArrayDv.getUint32(srcPos, true) * invScale;
              srcPos += 4;
              this.setPixelValuesByHeaderInfoDataType_(k, <number>(math.min(z, this.headerInfo_.zMax)));
            }
          }
        } else { // not all valid
          for (let i = i0; i < i1; i++) {
            let k: number = i * this.headerInfo_.width + j0;
            for (let j = j0; j < j1; j++, k++) {
              //TODO(lin.xiaoe.f@gmail.com): if (m_bitMask.IsValid(k))
              let z: number = offset + bufferArray[srcPos] * invScale;
              srcPos++;
              this.setPixelValuesByHeaderInfoDataType_(k, math.min(z, this.headerInfo_.zMax));
            }
          }
        }
      }
    }
    this.fp_ = ptr;
  }

  /**
   * Get data type used in offset.
   * @param tc The bits in 6-7.
   * @returns {*} Data type used in offset.
   * @private
   */
  getDataTypeUsed_(tc: number): Lerc2DataType {
    var dt = this.headerInfo_.lercDataType;
    switch(dt) {
      case Lerc2DataType.SHORT:
      case Lerc2DataType.INT: return dt - tc;
      case Lerc2DataType.USHORT:
      case Lerc2DataType.UINT: return dt - 2 * tc;
      case Lerc2DataType.FLOAT: return tc === 0 ? dt : (tc === 1 ? Lerc2DataType.SHORT : Lerc2DataType.BYTE);
      case Lerc2DataType.DOUBLE: return tc === 0 ? dt : dt - 2 * tc + 1;
      default:
        return dt;
    }
  }

  /**
   * Get LERC block header offset variable.
   * @param ptr The position of buffer.
   * @param dataTypeUsed The dataTypeUsed.
   * @returns {*} offset
   * @private
   */
  readVariableDataType_(ptr: number, dataTypeUsed: Lerc2DataType): { offset: number, ptr: number } {
    switch(dataTypeUsed) {
      case Lerc2DataType.CHAR: {
        var c = this.buffer_[ptr];
        ptr += 1;
        return {offset: c, ptr: ptr};
      }
      case Lerc2DataType.BYTE: {
        var b = this.buffer_[ptr];
        ptr += 1;
        return {offset: b, ptr: ptr};
      }
      case Lerc2DataType.SHORT: {
        var s = this.bufferDataView_.getInt16(ptr, true);
        ptr += 2;
        return {offset: s, ptr: ptr};
      }
      case Lerc2DataType.USHORT: {
        var us = this.bufferDataView_.getUint16(ptr, true);
        ptr += 2;
        return {offset: us, ptr: ptr};
      }
      case Lerc2DataType.INT: {
        var i = this.bufferDataView_.getInt32(ptr, true);
        ptr += 4;
        return {offset: i, ptr: ptr};
      }
      case Lerc2DataType.UINT: {
        var ui = this.bufferDataView_.getUint32(ptr, true);
        ptr += 4;
        return {offset: ui, ptr: ptr};
      }
      case Lerc2DataType.FLOAT: {
        var f = this.bufferDataView_.getFloat32(ptr, true);
        ptr += 4;
        return {offset: f, ptr: ptr};
      }
      case Lerc2DataType.DOUBLE: {
        var d = this.bufferDataView_.getFloat64(ptr, true);
        ptr += 8;
        return {offset: d, ptr: ptr};
      }
      default:
        return {offset: 0, ptr: ptr};
    }
  }

  readDataOneSweep_(): void {
    for (let i = 0; i < this.headerInfo_.height; i++) {
      let k: number = i * this.headerInfo_.width;
      let cntPixel: number = 0;
      let srcPtr: number = this.fp_;
      let sizeofType: number = 0;
      for (let j = 0; j < this.headerInfo_.width; j++, k++) {
        //TODO: if (m_bitMask.IsValid(k))
        switch (this.headerInfo_.lercDataType) {
          case Lerc2DataType.BYTE: {
            sizeofType = 1;
            this.setPixelValuesByHeaderInfoDataType_(k, this.bufferDataView_.getUint8(srcPtr));
            srcPtr += 1;
            cntPixel++;
            break;
          }
          case Lerc2DataType.INT: {
            sizeofType = 4;
            this.setPixelValuesByHeaderInfoDataType_(k, this.bufferDataView_.getInt32(srcPtr, true));
            srcPtr += 4;
            cntPixel++;
            break;
          }
          case Lerc2DataType.FLOAT: {
            sizeofType = 4;
            this.setPixelValuesByHeaderInfoDataType_(k, this.bufferDataView_.getFloat32(srcPtr, true));
            srcPtr += 4;
            cntPixel++;
            break;
          }
          default:
            throw `Unsupported type ${this.headerInfo_.lercDataType} in readDataOneSweep_`;
        }
      }
      this.fp_ = cntPixel * sizeofType;
    }
  }

  /**
   * Set pixel value to {@link pixelValuesDataView_}, equivalent to this.pixelValuesDataView_.setXXX with little endian.
   * @param position Position of pixelValues buffer.
   * @param value Value to set.
   * @param dataType DataType used in destination buffer.
   * @private
   */
  setPixelValues_(position: number, value: number, dataType: Lerc2DataType): void {
    switch (dataType) {
      case Lerc2DataType.FLOAT: {
        this.pixelValuesDataView_.setFloat32(position * 4, value, true);
        break;
      }
      case Lerc2DataType.INT: {
        this.pixelValuesDataView_.setInt32(position * 4, parseInt(<any>(value)), true);
        break;
      }
      case Lerc2DataType.BYTE: {
        this.pixelValuesDataView_.setUint8(position, value);
        break;
      }
      default:
        throw `Unsupported data type in setPixelValues_ ${this.headerInfo_.lercDataType}`;
    }
  }

  /**
   * Set pixel value to {@link pixelValuesDataView_}, equivalent to this.pixelValuesDataView_.setXXX with little endian.
   * The data type used depends on {@link headerInfo_}.
   * @param position Position of pixelValues buffer.
   * @param value Value to set.
   * @private
   */
  setPixelValuesByHeaderInfoDataType_(position: number, value: number): void {
    this.setPixelValues_(position, value, this.headerInfo_.lercDataType);
  }

  /**
   * Equivalent to sizeof(T) in C.
   * @returns {number} size of type used.
   * @private
   */
  sizeofHeaderInfoDataType_(): number {
    switch (this.headerInfo_.lercDataType) {
      case Lerc2DataType.FLOAT:
      case Lerc2DataType.INT:
      case Lerc2DataType.UINT: return 4;
      case Lerc2DataType.BYTE:
      case Lerc2DataType.CHAR: return 1;
      case Lerc2DataType.SHORT:
      case Lerc2DataType.USHORT: return 2;
      case Lerc2DataType.DOUBLE: return 8;
      default:
        return 0;
    }
  }

  /**
   * Get human readable name from given type.
   * @param dataType Lerc2 data type in header.
   * @returns {string} Name of type.
   * @private
   */
  static nameFromDataType_(dataType: Lerc2DataType): string {
    switch (dataType) {
      case Lerc2DataType.FLOAT: return "FLOAT";
      case Lerc2DataType.INT: return "INT";
      case Lerc2DataType.UINT: return "UINT";
      case Lerc2DataType.BYTE: return "BYTE";
      case Lerc2DataType.CHAR: return "CHAR";
      case Lerc2DataType.SHORT: return "SHORT";
      case Lerc2DataType.USHORT: return "USHORT";
      case Lerc2DataType.DOUBLE: return "DOUBLE";
      default:
        return "UNDEFINED";
    }
  }
}
