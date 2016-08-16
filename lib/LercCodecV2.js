var math = require('mathjs');

var LERC = function () {

  var LercCodec = {};

  LercCodec.defaultNoDataValue = -3.4027999387901484e+38; // smallest Float32 value

  LercCodec.decode = function (buffer, options) {
    options = options || {};

    parse(buffer);

    // var skipMask = options.encodedMaskData || (options.encodedMaskData === null);
    // var parsedData = parse(input, options.inputOffset || 0, skipMask);
    //
    // var noDataValue = (options.noDataValue != null) ? options.noDataValue : LercCodec.defaultNoDataValue;
    // var result = {
    //   width: parsedData.width,
    //   height: parsedData.height,
    //   pixelData: uncompressedData.resultPixels,
    //   minValue: parsedData.pixels.minValue,
    //   maxValue: parsedData.pixels.maxValue,
    //   noDataValue: noDataValue
    // };
    //
    // return result;
  };

  /**
   * Format Identifier String.
   * @type {string}
   * @const
   */
  var FILE_KEY_ = "Lerc2 ";

  var headerInfo_ = {};

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

  var parse = function(buffer) {
    readHeader_(buffer);
    console.log(headerInfo_);

    if (!isChecksumMatch_(buffer, headerInfo_))
      throw "Checksum is not matched";

    if (headerInfo_.numValidPixel === 0)
      return;

    //TODO(lin.xiaoe.f@gmail.com): Read mask, assumes bit mask is all valid now.
    readMask_(buffer);

    if (headerInfo_.zMin === headerInfo_.zMax) {
      //TODO(lin.xiaoe.f@gmail.com): Image is const, implement it later.
      throw "Const image is not implemented yet";
    }

    //TODO(lin.xiaoe.f@gmail.com): ReadTile goes for here.
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
    var numBytesMask = dataView.getInt32(fp_);
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

  var readTile_ = function(buffer, i0, i1, j0, j1) {
    var numPixel = 0;

    var compareFlag = buffer[1];
    var bits67 = compareFlag >> 6;

    var testCode = (compareFlag >> 2) & 15; // use bits 2345 for integrity check
    if (testCode != ((j0 >> 3) & 15))
      return false;

    compareFlag &= 3;

    if (compareFlag == 2) { // entire tile is constant 0 (if valid or invalid doesn't matter)
      //TODO(lin.xiaoe.f@gmail.com): entire tile is constant 0.
      throw "entire tile is constant 0 is not supported yet";
    } else if (compareFlag == 0) { // read z's binary uncompressed
      //TODO(lin.xiaoe.f@gmail.com): raw binary.
      throw "raw binary is not supported yet";
    } else {
      var dataTypeUsed = getDataTypeUsed_(bits67);
      console.log(dataTypeUsed);
    }
  };

  var readTiles_ = function (buffer) {
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
      case DataType.FLOAT: return tc == 0 ? dt : (tc == 1 ? DataType.SHORT : DataType.BYTE);
      case DataType.DOUBLE: return tc == 0 ? dt : dt - 2 * tc + 1;
      default:
        return dt;
    }
  };

  var readVariableDataType_ = function(buffer, dataTypeUsed) {

  };

  return LercCodec;
};

module.exports.Lerc = LERC;
