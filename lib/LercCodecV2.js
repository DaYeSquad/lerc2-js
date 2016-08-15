var math = require('mathjs');

var LERC = function () {

  var LercCodec = {};

  LercCodec.defaultNoDataValue = -3.4027999387901484e+38; // smallest Float32 value

  LercCodec.decode = function (input, options) {
    options = options || {};

    var headerInfo = readHeader(input, options.inputOffset);
    console.log(headerInfo);

    var match = isChecksumMatch(input, headerInfo);
    console.log(match);

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

  const FILE_KEY = "Lerc2 ";

  var parse = function (input, fp, skipMask) {
    var data = {};

    // File header
    var fileIdView = new Uint8Array(input, fp, 6);
    data.fileIdentifierString = String.fromCharCode.apply(null, fileIdView);
    console.log(data.fileIdentifierString);
    if (data.fileIdentifierString.trim() != FILE_KEY) {
      throw "Unexpected file identifier string: " + data.fileIdentifierString;
    }
    fp += 6;
    var view = new DataView(input, fp, 56);
    data.fileVersion = view.getInt32(0, true); // Int 4
    data.checkSum = view.getUint32(4, true); // UInt 4
    data.height = view.getInt32(8, true);  // Int 4
    data.width = view.getInt32(12, true); // Int 4
    data.numValidPixel = view.getInt32(16, true); // Int 4
    data.microBlockSize = view.getInt32(20, true); // Int 4
    data.blobSize = view.getInt32(24, true); // Int 4
    data.lercDataType = view.getInt32(28, true); // Int 4
    data.maxZError = view.getFloat64(32, true); // Double 8
    data.zMin = view.getFloat64(40, true); // Double 8
    data.zMax = view.getFloat64(48, true); // Double 8
    fp += 56;

    //TODO (lin.xiaoe.f@gmail.com): check if checksum is right

    //TODO (lin.xiaoe.f@gmail.com): read mask
    if (!skipMask) {
      view = new DataView(input, fp, 4);

      data.mask = {};
      data.mask.maskBlobSize = view.getInt32(0, true);
      // data.mask.numBlocksX = view.getUint32(4, true);
      // data.mask.numBytes = view.getUint32(8, true);
      // data.mask.maxValue = view.getFloat32(12, true);
      fp += 4;
      view = new DataView(input, fp, 2);
      console.log(view.getInt8(0, true))
      console.log(view.getInt8(1, true))
      fp += 2;

      view = new DataView(input, fp, 16);
      console.log(view.getInt32(0, true));
      console.log(view.getInt32(4, true));
      console.log(view.getInt32(8, true));
      console.log(view.getInt32(12, true));

      console.log(data);
      return;
      // Mask Data
      if (data.mask.numBytes > 0) {
        var bitset = new Uint8Array(Math.ceil(data.width * data.height / 8));
        view = new DataView(input, fp, data.mask.numBytes);
        var cnt = view.getInt16(0, true);
        var ip = 2, op = 0;
        do {
          if (cnt > 0) {
            while (cnt--) {
              bitset[op++] = view.getUint8(ip++);
            }
          } else {
            var val = view.getUint8(ip++);
            cnt = -cnt;
            while (cnt--) {
              bitset[op++] = val;
            }
          }
          cnt = view.getInt16(ip, true);
          ip += 2;
        } while (ip < data.mask.numBytes);
        if ((cnt !== -32768) || (op < bitset.length)) {
          throw "Unexpected end of mask RLE encoding";
        }
        data.mask.bitset = bitset;
        fp += data.mask.numBytes;
      }
      else if ((data.mask.numBytes | data.mask.numBlocksY | data.mask.maxValue) == 0) {  // Special case, all nodata
        var bitset = new Uint8Array(Math.ceil(data.width * data.height / 8));
        data.mask.bitset = bitset;
      }
    }

    if (data.numValidPixel == 0) {
      return;
    }

    // check if image is const
    if (data.zMin === data.zMax) {
      var z0 = data.zMin;
      for (var i = 0; i < data.height; ++i) {
        var k = i * data.width;
        for (var j = 0; j < data.width; ++j) {
          //TODO (lin.xiaoe.f@gmail.com): check bitmask is valid
          data.resultPixels[k] = z0;
        }
      }
      return;
    }


    return data;
  };

  var readHeader = function (buffer) {
    var headerInfo = {};

    // file header first 6 chars should be "Lerc2", byte offset is 0.
    var bytes = new Uint8Array(buffer, 0, 6);
    headerInfo.fileIdentifierString = String.fromCharCode.apply(null, bytes);
    if (headerInfo.fileIdentifierString != FILE_KEY) {
      throw "Unexpected file identifier string: " + headerInfo.fileIdentifierString;
    }

    // lerc stores in little endian
    var view = new DataView(buffer);
    headerInfo.version = view.getInt32(6, true);         // Int 4
    headerInfo.checkSum = view.getUint32(10, true);      // UInt 4
    headerInfo.height = view.getInt32(14, true);         // Int 4
    headerInfo.width = view.getInt32(18, true);          // Int 4
    headerInfo.numValidPixel = view.getInt32(22, true);  // Int 4
    headerInfo.microBlockSize = view.getInt32(26, true); // Int 4
    headerInfo.blobSize = view.getInt32(30, true);       // Int 4
    headerInfo.lercDataType = view.getInt32(34, true);   // Int 4
    headerInfo.maxZError = view.getFloat64(38, true);    // Double 8
    headerInfo.zMin = view.getFloat64(46, true);         // Double 8
    headerInfo.zMax = view.getFloat64(54, true);         // Double 8

    return headerInfo;
  };

  /**
   * Check checksum is match or not, returns true if match.
   * @param buffer LERC buffer.
   * @param headerInfo LERC header information, use {@link readHeader} to get it.
   * @returns {boolean} true if checksum is the same.
   */
  var isChecksumMatch = function (buffer, headerInfo) {
    if (headerInfo.version >= 3) {
      var nChecksumFieldBytes = FILE_KEY.length + 8; // start right after the checksum entry
      var checksum = computeChecksumFletcher32(buffer,
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
   * {@link computeChecksumFletcher32Wrong} though this method now results out of INT_MAX error in process.
   *
   * @param buffer LERC buffer.
   * @param len Buffer length.
   * @returns {number} Result.
   */
  var computeChecksumFletcher32 = function (buffer, len) {
      var lercBlobLen = len;

      var sum1 = math.bignumber(0xffff);
      var sum2 = math.bignumber(0xffff);
      var words = parseInt(lercBlobLen / 2);

      var iByte = 14;

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
  var computeChecksumFletcher32Wrong = function (buffer, len) {
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

  var readTiles = function (lercBlob, headerInfo, resultPixels) {
    var bufferVec = new Uint32Array();

    var mbSize = headerInfo.microBlockSize;
    var height = headerInfo.height;
    var width = headerInfo.width;

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

        if (!readTiles(ppByte, data, i0, i0 + tileH, j0, j0 + tileW, bufferVec))
          return false;
      }
    }

    return true;
  };

  return LercCodec;
};

module.exports.Lerc = LERC;