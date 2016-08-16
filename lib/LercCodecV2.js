// LercCodecV2.js
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

var math = require('mathjs');

var LERC = function () {

  var LercCodec = {};

  /**
   * Format Identifier String.
   * @type {string}
   * @const
   */
  var FILE_KEY_ = "Lerc2 ";

  var headerInfo_ = {};

  var pixelValuesDataView_;

  /**
   * File seek position.
   * @type {number}
   * @private
   */
  var fp_ = 0;

  /**
   * DateType enums.
   * @enum {int}
   * @type {{CHAR: number, BYTE: number, SHORT: number, USHORT: number, INT: number, UINT: number, FLOAT: number,
   * DOUBLE: number, UNDEFINED: number}}
   */
  var DataType = {
    CHAR: 0,
    BYTE: 1,
    SHORT: 2,
    USHORT: 3,
    INT: 4,
    UINT: 5,
    FLOAT: 6,
    DOUBLE: 7,
    UNDEFINED: 8
  };

  LercCodec.defaultNoDataValue = -3.4027999387901484e+38; // smallest Float32 value

  LercCodec.decode = function (buffer) {
    parse_(buffer);

    var result = {
      width: headerInfo_.width,
      height: headerInfo_.height,
      pixelData: pixelValuesDataView_.buffer
    };

    console.log("pixel values" + pixelValuesDataView_.byteLength);

    return result;
  };

  var parse_ = function(buffer) {
    readHeader_(buffer);

    // You can safely skip this step.
    if (!isChecksumMatch_(buffer, headerInfo_))
      throw "Checksum is not matched";

    //TODO(lin.xiaoe.f@gmail.com): Assumes the data type is float.
    pixelValuesDataView_ = new DataView(new Uint8Array(headerInfo_.height * headerInfo_.width * 4).buffer);

    if (headerInfo_.numValidPixel === 0)
      return;

    //TODO(lin.xiaoe.f@gmail.com): Read mask, assumes bit mask is all valid now.
    readMask_(buffer);

    if (headerInfo_.zMin === headerInfo_.zMax) {
      //TODO(lin.xiaoe.f@gmail.com): Image is const, implement it later.
      throw "Const image is not implemented yet";
    }

    var readDataOneSweepFlag = buffer[fp_]; // read flag
    fp_++;

    if (readDataOneSweepFlag === 0) { // no binary data in one sweep
      readTiles_(buffer);
    } else {
      //TODO(lin.xiaoe.f@gmail.com): ReadTile data one sweep goes for here.
      console.log("Read data one sweep");
    }
  };

  /**
   * Get LERC header info, including version, checksum, width, height, numValidPixel, microBlockSize, blobSize,
   * lercDataType, maxZError, zMin, zMax and move the file position to the mask block.
   *
   * @param buffer LERC buffer.
   * @returns {{headerInfo}} LERC header information.
   */
  var readHeader_ = function (buffer) {
    // file header first 6 chars should be "Lerc2", byte offset is 0.
    var bytes = new Uint8Array(buffer, 0, 6);
    headerInfo_.fileIdentifierString = String.fromCharCode.apply(null, bytes);
    if (headerInfo_.fileIdentifierString != FILE_KEY_) {
      throw "Unexpected file identifier string: " + headerInfo_.fileIdentifierString;
    }

    // lerc stores in little endian
    var view = new DataView(buffer);
    headerInfo_.version = view.getInt32(6, true);         // Int 4
    headerInfo_.checkSum = view.getUint32(10, true);      // UInt 4
    headerInfo_.height = view.getInt32(14, true);         // Int 4
    headerInfo_.width = view.getInt32(18, true);          // Int 4
    headerInfo_.numValidPixel = view.getInt32(22, true);  // Int 4
    headerInfo_.microBlockSize = view.getInt32(26, true); // Int 4
    headerInfo_.blobSize = view.getInt32(30, true);       // Int 4
    headerInfo_.lercDataType = view.getInt32(34, true);   // Int 4
    headerInfo_.maxZError = view.getFloat64(38, true);    // Double 8
    headerInfo_.zMin = view.getFloat64(46, true);         // Double 8
    headerInfo_.zMax = view.getFloat64(54, true);         // Double 8

    fp_ += 62;
  };

  /**
   * Check checksum is match or not, returns true if match.
   * @param buffer LERC buffer.
   * @param headerInfo LERC header information, use {@link readHeader_} to get it.
   * @returns {boolean} true if checksum is the same.
   */
  var isChecksumMatch_ = function (buffer, headerInfo) {
    if (headerInfo.version >= 3) {
      var nChecksumFieldBytes = FILE_KEY_.length + 8; // start right after the checksum entry
      var checksum = computeChecksumFletcher32_(buffer,
        headerInfo.blobSize - nChecksumFieldBytes);

      if (checksum != headerInfo.checkSum) {
        return false;
      }
    }
    return true;
  };

  /**
   * Fletcher's checksum with bytes. (https://en.wikipedia.org/wiki/Fletcher's_checksum)
   *
   * Warning, this implementation is super slow, you may want to improve this version by give eyes on
   * {@link computeChecksumFletcher32Wrong_} though this method now results out of INT_MAX error in process.
   *
   * @param buffer LERC buffer.
   * @param len Buffer length.
   * @returns {number} Result.
   */
  var computeChecksumFletcher32_ = function (buffer, len) {
      var lercBlobLen = len;

      var sum1 = math.bignumber(0xffff);
      var sum2 = math.bignumber(0xffff);
      var words = parseInt(lercBlobLen / 2);

      var iByte = FILE_KEY_.length + 8; // start right after the checksum entry

      while (words) {
        var tlen = (words >= 359) ? 359 : words;
        words -= tlen;
        do {
          sum1 = math.sum(sum1, buffer[iByte++] << 8);
          sum1 = math.sum(sum1, buffer[iByte++]);
          sum2 = math.sum(sum1, sum2);
        } while (--tlen);

        sum1 = math.sum(math.bitAnd(sum1, 0xffff), math.rightArithShift(sum1, 16));
        sum2 = math.sum(math.bitAnd(sum2, 0xffff), math.rightArithShift(sum2, 16));
      }

      // add the straggler byte if it exists
      if (lercBlobLen & 1) {
        sum1 = math.sum(sum1, math.leftShift(buffer[iByte], 8));
        sum2 = math.sum(sum1, sum2);
      }

      // second reduction step to reduce sums to 16 bits
      sum1 = math.sum(math.bitAnd(sum1, 0xffff), math.rightArithShift(sum1, 16));
      sum2 = math.sum(math.bitAnd(sum2, 0xffff), math.rightArithShift(sum2, 16));

      // sum2 << 16 | sum1 is greater than INT_MAX use math.js instead.
      var result = math.leftShift(math.bignumber(sum2), 16);
      result = math.bitOr(result, sum1);

      return result;
    };

  /**
   * Fletcher's checksum with bytes. (https://en.wikipedia.org/wiki/Fletcher's_checksum)
   *
   * Warning, this implementation cannot work but much much much faster than the right one.
   *
   * @param buffer LERC buffer.
   * @param len Buffer length.
   * @returns {number} Result.
   */
  var computeChecksumFletcher32Wrong_ = function (buffer, len) {
    var lercBlobLen = len;

    var sum1 = 0xffff;
    var sum2 = 0xffff;
    var words = parseInt(lercBlobLen / 2);

    var iByte = 14;

    while(words) {
      var tlen = (words >= 359) ? 359 : words;
      words -= tlen;
      do {
        sum1 += (buffer[iByte++] << 8);
        sum2 += sum1 += buffer[iByte++];
        console.log(sum2);
      } while (--tlen);

      sum1 = (sum1 & 0xffff) + (sum1 >> 16);
      sum2 = (sum2 & 0xffff) + (sum2 >> 16);
    }

    // add the straggler byte if it exists
    if (lercBlobLen & 1) {
      sum2 += sum1 += (buffer[iByte] << 8);
    }

    // second reduction step to reduce sums to 16 bits
    sum1 = (sum1 & 0xffff) + (sum1 >> 16);
    sum2 = (sum2 & 0xffff) + (sum2 >> 16);
    console.log("Sum1 is " + sum1 + " ,sum2 is " + sum2);

    // sum2 << 16 | sum1 is greater than INT_MAX use math.js instead.
    var result = math.leftShift(math.bignumber(sum2), 16);
    result = math.bitOr(result, sum1);

    console.log("Bignumber result is " + result);

    return result;
  };

  /**
   * Read the bit mask of LERC.
   * @param buffer The LERC binary buffer.
   * @private
   */
  var readMask_ = function(buffer) {
    var numValid = headerInfo_.numValidPixel;
    var width = headerInfo_.width;
    var height = headerInfo_.height;

    // get mask blob size in bytes
    var dataView = new DataView(buffer);
    var numBytesMask = dataView.getInt32(fp_, true);
    fp_ += 4;

    if ((numValid === 0 || numValid === width * height) && (numBytesMask != 0))
      throw "Read mask failed";

    if (numValid == 0) {
      //TODO(lin.xiaoe.f@gmail.com): Bit Mask is all invalid.
      console.log("All pixels are invalid");
    } else if (numValid === width * height) {
      //TODO(lin.xiaoe.f@gmail.com): Bit Mask is all valid.
      console.log("All pixels are valid");
    } else if (numBytesMask > 0) {
      //TODO(lin.xiaoe.f@gmail.com): RLE decompress.
      console.log("Need RLE decompress");
      fp_ += numBytesMask;
    }
  };

  /**
   * Read pixel values.
   * @param buffer LERC binary buffer.
   * @private
   */
  var readTiles_ = function (buffer) {
    if (headerInfo_.version > 1 &&
      (headerInfo_.lercDataType === DataType.BYTE || headerInfo_.lercDataType === DataType.CHAR) &&
      headerInfo_.maxZError === 0.5) {
      //TODO(lin.xiaoe.f@gmail.com): Try Huffman.
      throw "Try Huffman is not implemented yet";
    }

    var mbSize = headerInfo_.microBlockSize;
    var height = headerInfo_.height;
    var width = headerInfo_.width;

    var numTilesVertical = (height + mbSize - 1) / mbSize;
    var numTilesHorizontal = (width + mbSize - 1) / mbSize;

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

        readTile_(buffer, i0, i0 + tileH, j0, j0 + tileW);
      }
    }
  };

  /**
   * Read each block tile.
   * @param buffer LERC buffer.
   * @param i0
   * @param i1
   * @param j0
   * @param j1
   * @private
   */
  var readTile_ = function(buffer, i0, i1, j0, j1) {
    var compareFlag = buffer[fp_++];
    var bits67 = compareFlag >> 6;

    var testCode = (compareFlag >> 2) & 15; // use bits 2345 for integrity check
    if (testCode != ((j0 >> 3) & 15)) {
      throw "Read tile integrity check failed";
    }

    compareFlag &= 3;

    if (compareFlag === 2) { // entire tile is constant 0 (if valid or invalid doesn't matter)
      //TODO(lin.xiaoe.f@gmail.com): entire tile is constant 0.
      throw "entire tile is constant 0 is not supported yet";
    } else if (compareFlag === 0) { // read z's binary uncompressed
      //TODO(lin.xiaoe.f@gmail.com): raw binary.
      throw "raw binary is not supported yet";
    } else {
      var dataTypeUsed = getDataTypeUsed_(bits67);
      var offset = readVariableDataType_(buffer, dataTypeUsed);
      if (compareFlag === 3) {
        for (var i = i0; i < i1; i++) {
          var k = i * headerInfo_.width + j0;
          for (var j = j0; j < j1; j++, k++) {
            // if (bitMask.IsValid(k))
            if (headerInfo_.lercDataType === DataType.FLOAT) {
              pixelValuesDataView_.setFloat32(k * 4, parseFloat(offset));
            } else {
              throw "DataType rather than FLOAT is not supported yet";
            }
          }
        }
      } else {
        var bufferArray = bitStuff2Decode_(buffer, headerInfo_.version);

        var invScale = 2 * headerInfo_.maxZError;
        var srcPos = 0;

        if (bufferArray.length == (i1 - i0) * (j1 - j0)) { // all valid
          for (var i = i0; i < i1; i++) {
            var k = i * headerInfo_.width + j0;
            for (var j = j0; j < j1; j++, k++) {
              var z = offset + bufferArray[srcPos++] * invScale;
              if (headerInfo_.lercDataType === DataType.FLOAT) {
                pixelValuesDataView_.setFloat32(k * 4, math.min(z, headerInfo_.zMax));
              } else {
                throw "DataType rather than FLOAT is not supported yet";
              }
            }
          }
        } else { // not all valid
          for (var i = i0; i < i1; i++) {
            var k = i * headerInfo_.width + j0;
            for (var j = j0; j < j1; j++, k++) {
              // if (m_bitMask.IsValid(k))
              var z = offset + bufferArray[srcPos++] * invScale;
              if (headerInfo_.lercDataType === DataType.FLOAT) {
                pixelValuesDataView_.setFloat32(k, math.min(z, headerInfo_.zMax));
              } else {
                throw "DataType rather than FLOAT is not supported yet";
              }
            }
          }
        }
      }
    }
  };

  /**
   * Get data type used in offset.
   * @param tc The bits in 6-7.
   * @returns {*} Data type used in offset.
   * @private
   */
  var getDataTypeUsed_ = function(tc) {
    var dt = headerInfo_.lercDataType;
    switch(dt) {
      case DataType.SHORT:
      case DataType.INT: return dt - tc;
      case DataType.USHORT:
      case DataType.UINT: return dt - 2 * tc;
      case DataType.FLOAT: return tc === 0 ? dt : (tc === 1 ? DataType.SHORT : DataType.BYTE);
      case DataType.DOUBLE: return tc === 0 ? dt : dt - 2 * tc + 1;
      default:
        return dt;
    }
  };

  /**
   * Get LERC block header offset variable.
   * @param buffer LERC binary buffer.
   * @param dataTypeUsed {DataType}
   * @returns {*} offset
   * @private
   */
  var readVariableDataType_ = function(buffer, dataTypeUsed) {
    switch(dataTypeUsed) {
      case DataType.CHAR: {
        var c = buffer[fp_];
        fp_ += 1;
        return c;
      }
      case DataType.BYTE: {
        var b = buffer[fp_];
        fp_ += 1;
        return b;
      }
      case DataType.SHORT: {
        var dv = new DataView(buffer);
        var s = dv.getInt16(fp_, true);
        fp_ += 2;
        return s;
      }
      case DataType.USHORT: {
        var dv = new DataView(buffer);
        var us = dv.getUint16(fp_, true);
        fp_ += 2;
        return us;
      }
      case DataType.INT: {
        var dv = new DataView(buffer);
        var i = dv.getInt32(fp_, true);
        fp_ += 4;
        return i;
      }
      case DataType.UINT: {
        var dv = new DataView(buffer);
        var ui = dv.getUint32(fp_, true);
        fp_ += 4;
        return ui;
      }
      case DataType.FLOAT: {
        var dv = new DataView(buffer);
        var f = dv.getFloat32(fp_, true);
        fp_ += 4;
        return f;
      }
      case DataType.DOUBLE: {
        var dv = new DataView(buffer);
        var d = dv.getFloat64(fp_, true);
        fp_ += 4;
        return d;
      }
      default:
        return 0;
    }
  };

  var bitStuff2Decode_ = function(buffer, lerc2Version) {
    var dataArray = new Uint8Array(0);

    var numBitsByte = buffer[fp_];
    fp_++;

    var bits67 = numBitsByte >> 6;
    var n = (bits67 == 0) ? 4 : 3 - bits67;

    var doLut = (numBitsByte & (1 << 5)) ? true : false;    // bit 5
    numBitsByte &= 31;    // bits 0-4;

    var numElements = bitStuff2DecodeUInt_(buffer, n);
    var numBits = numBitsByte;
    if (!doLut) {
      if (numBits > 0) {
        if (lerc2Version >= 3) {
          dataArray = bitStuff2Unstuff_(buffer, numElements, numBits);
        } else {
          throw "BitStuff2 decode failed because of unsupported lerc2 version";
        }
      }
    } else {
      var nLutByte = buffer[fp_];
      fp_++;

      var nLut = nLutByte - 1;
      var tmpLutArray;
      if (lerc2Version >= 3) {
        tmpLutArray = bitStuff2Unstuff_(buffer, nLut, numBits); // unstuff lut w/o the 0
      } else {
        throw "BitStuff2 decode failed because of unsupported lerc2 version";
      }

      var nBitsLut = 0;
      while (nLut >> nBitsLut) {
        nBitsLut++;
      }

      if (lerc2Version >= 3) {
        dataArray = bitStuff2Unstuff_(buffer, numElements, nBitsLut); // unstuff indexes
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

    return dataArray;
  };

  var bitStuff2DecodeUInt_ = function(buffer, numFixedLengthValue) {
    var numElements = 0;

    if (numFixedLengthValue === 1) {
      numElements = buffer[fp_];
    } else if (numFixedLengthValue === 2) {
      var dv = new DataView(buffer);
      numElements = dv.getUint16(fp_);
    } else if (numFixedLengthValue === 4) {
      var dv = new DataView(buffer);
      numElements = dv.getUint32(fp_);
    } else {
      throw "BitStuff2 DecodeUInt failed";
    }

    fp_ += numFixedLengthValue;
    return numElements;
  };

  var bitStuff2Unstuff_ = function(buffer, numElements, numBits) {
    var dataArray = new Uint8Array(numElements);

    var numUInts = parseInt((numElements * numBits + 31) / 32);
    var numBytes = numUInts * 4;

    var bitStuffArray = new Uint8Array(numUInts);
    bitStuffArray[numUInts - 1] = 0; // set last uint to 0

    // copy the bytes from the incoming byte stream
    var numBytesUsed = numBytes - bitStuff2NumTailBytesNotNeeded_(numElements, numBits);
    for (var i = 0; i < numBytesUsed; i++) {
      bitStuffArray[i] = buffer[fp_ + i];
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

    fp_ += numBytesUsed;
    return dataArray;
  };

  var bitStuff2NumTailBytesNotNeeded_ = function(numElements, numBits) {
    var numBitsTail = (numElements * numBits) & 31;
    var numBytesTail = (numBitsTail + 7) >> 3;
    return (numBytesTail > 0) ? 4 - numBytesTail : 0;
  };

  return LercCodec;
};

module.exports.Lerc = LERC;
