"use strict";
var bitstuff2_1 = require('./bitstuff2');
var math = require('mathjs');
var Lerc2DataType;
(function (Lerc2DataType) {
    Lerc2DataType[Lerc2DataType["CHAR"] = 0] = "CHAR";
    Lerc2DataType[Lerc2DataType["BYTE"] = 1] = "BYTE";
    Lerc2DataType[Lerc2DataType["SHORT"] = 2] = "SHORT";
    Lerc2DataType[Lerc2DataType["USHORT"] = 3] = "USHORT";
    Lerc2DataType[Lerc2DataType["INT"] = 4] = "INT";
    Lerc2DataType[Lerc2DataType["UINT"] = 5] = "UINT";
    Lerc2DataType[Lerc2DataType["FLOAT"] = 6] = "FLOAT";
    Lerc2DataType[Lerc2DataType["DOUBLE"] = 7] = "DOUBLE";
    Lerc2DataType[Lerc2DataType["UNDEFINED"] = 8] = "UNDEFINED";
})(Lerc2DataType || (Lerc2DataType = {}));
var Lerc2Decoder = (function () {
    function Lerc2Decoder(buffer) {
        this.buffer_ = undefined;
        this.bufferDataView_ = undefined;
        this.fp_ = 0;
        this.headerInfo_ = {};
        this.bitStuff2Util_ = undefined;
        this.pixelValuesDataView_ = undefined;
        this.buffer_ = buffer;
        this.bitStuff2Util_ = new bitstuff2_1.BitStuff2(new Uint8Array(buffer));
        this.bufferDataView_ = new DataView(this.buffer_);
    }
    Lerc2Decoder.prototype.parse = function (skipChecksum) {
        if (skipChecksum === void 0) { skipChecksum = true; }
        this.readHeader_();
        this.bitStuff2Util_.setLerc2Version(this.headerInfo_.version);
        if (!skipChecksum) {
            if (!this.isChecksumMatch_())
                throw "Checksum is not matched";
        }
        this.pixelValuesDataView_ = new DataView(new Uint8Array(this.headerInfo_.height * this.headerInfo_.width * this.sizeofHeaderInfoDataType_()).buffer);
        for (var i = 0; i < this.headerInfo_.width * this.headerInfo_.height; i++) {
            this.setPixelValuesByHeaderInfoDataType_(i, 0);
        }
        if (this.headerInfo_.numValidPixel === 0)
            return;
        this.readMask_();
        if (this.headerInfo_.zMin === this.headerInfo_.zMax) {
            var z0 = this.headerInfo_.zMin;
            for (var i = 0; i < this.headerInfo_.height; i++) {
                var k = i * this.headerInfo_.width;
                for (var j = 0; j < this.headerInfo_.width; j++) {
                    this.setPixelValuesByHeaderInfoDataType_(k, z0);
                }
            }
            return { width: this.headerInfo_.width, height: this.headerInfo_.height,
                zMin: this.headerInfo_.zMin, zMax: this.headerInfo_.zMax,
                dataType: this.headerInfo_.lercDataType, pixelData: this.pixelValuesDataView_.buffer };
        }
        var readDataOneSweepFlag = this.bufferDataView_.getUint8(this.fp_);
        this.fp_++;
        if (readDataOneSweepFlag === 0) {
            this.readTiles_();
        }
        else {
            this.readDataOneSweep_();
        }
        return { width: this.headerInfo_.width, height: this.headerInfo_.height,
            zMin: this.headerInfo_.zMin, zMax: this.headerInfo_.zMax,
            dataType: this.headerInfo_.lercDataType, pixelData: this.pixelValuesDataView_.buffer };
    };
    Lerc2Decoder.prototype.readHeader_ = function () {
        var bytes = new Uint8Array(this.buffer_, 0, 6);
        this.headerInfo_.fileIdentifierString = String.fromCharCode.apply(null, bytes);
        if (this.headerInfo_.fileIdentifierString != Lerc2Decoder.FILE_KEY_) {
            throw "Unexpected file identifier string: " + this.headerInfo_.fileIdentifierString;
        }
        this.headerInfo_.version = this.bufferDataView_.getInt32(6, true);
        this.headerInfo_.checksum = this.bufferDataView_.getUint32(10, true);
        this.headerInfo_.height = this.bufferDataView_.getInt32(14, true);
        this.headerInfo_.width = this.bufferDataView_.getInt32(18, true);
        this.headerInfo_.numValidPixel = this.bufferDataView_.getInt32(22, true);
        this.headerInfo_.microBlockSize = this.bufferDataView_.getInt32(26, true);
        this.headerInfo_.blobSize = this.bufferDataView_.getInt32(30, true);
        this.headerInfo_.lercDataType = this.bufferDataView_.getInt32(34, true);
        this.headerInfo_.maxZError = this.bufferDataView_.getFloat64(38, true);
        this.headerInfo_.zMin = this.bufferDataView_.getFloat64(46, true);
        this.headerInfo_.zMax = this.bufferDataView_.getFloat64(54, true);
        this.fp_ += 62;
    };
    Lerc2Decoder.prototype.isChecksumMatch_ = function () {
        if (this.headerInfo_.version >= 3) {
            var nChecksumFieldBytes = Lerc2Decoder.FILE_KEY_.length + 8;
            var checksum = this.computeChecksumFletcher32_(this.headerInfo_.blobSize - nChecksumFieldBytes);
            if (checksum != this.headerInfo_.checksum) {
                return false;
            }
        }
        return true;
    };
    Lerc2Decoder.prototype.computeChecksumFletcher32_ = function (len) {
        var lercBlobLen = len;
        var sum1 = math.bignumber(0xffff);
        var sum2 = math.bignumber(0xffff);
        var words = parseInt((lercBlobLen / 2));
        var iByte = Lerc2Decoder.FILE_KEY_.length + 8;
        while (words) {
            var tlen = (words >= 359) ? 359 : words;
            words -= tlen;
            do {
                sum1 = math.sum(sum1, this.bufferDataView_.getUint8(iByte++) << 8);
                sum1 = math.sum(sum1, this.bufferDataView_.getUint8(iByte++));
                sum2 = math.sum(sum1, sum2);
            } while (--tlen);
            sum1 = math.sum(math.bitAnd(sum1, 0xffff), math.rightArithShift(sum1, 16));
            sum2 = math.sum(math.bitAnd(sum2, 0xffff), math.rightArithShift(sum2, 16));
        }
        if (lercBlobLen & 1) {
            sum1 = math.sum(sum1, math.leftShift(this.bufferDataView_.getUint8(iByte), 8));
            sum2 = math.sum(sum1, sum2);
        }
        sum1 = math.sum(math.bitAnd(sum1, 0xffff), math.rightArithShift(sum1, 16));
        sum2 = math.sum(math.bitAnd(sum2, 0xffff), math.rightArithShift(sum2, 16));
        var result = math.leftShift(sum2, 16);
        result = math.bitXor(result, sum1);
        return result;
    };
    Lerc2Decoder.prototype.computeChecksumFletcher32Wrong_ = function (len) {
        var lercBlobLen = len;
        var sum1 = 0xffff;
        var sum2 = 0xffff;
        var words = parseInt(String(lercBlobLen / 2));
        var iByte = 14;
        while (words) {
            var tlen = (words >= 359) ? 359 : words;
            words -= tlen;
            do {
                sum1 += (this.bufferDataView_.getUint8(iByte++) << 8);
                sum2 += sum1 += this.bufferDataView_.getUint8(iByte++);
            } while (--tlen);
            sum1 = (sum1 & 0xffff) + (sum1 >> 16);
            sum2 = (sum2 & 0xffff) + (sum2 >> 16);
        }
        if (lercBlobLen & 1) {
            sum2 += sum1 += (this.bufferDataView_.getUint8(iByte) << 8);
        }
        sum1 = (sum1 & 0xffff) + (sum1 >> 16);
        sum2 = (sum2 & 0xffff) + (sum2 >> 16);
        var result = math.leftShift(math.bignumber(sum2), 16);
        result = math.bitXor(result, sum1);
        return result;
    };
    Lerc2Decoder.prototype.readMask_ = function () {
        var numValid = this.headerInfo_.numValidPixel;
        var width = this.headerInfo_.width;
        var height = this.headerInfo_.height;
        var numBytesMask = this.bufferDataView_.getInt32(this.fp_, true);
        this.fp_ += 4;
        if ((numValid === 0 || numValid === width * height) && (numBytesMask != 0))
            throw "Read mask failed";
        if (numValid == 0) {
        }
        else if (numValid === width * height) {
        }
        else if (numBytesMask > 0) {
            console.log("Need RLE decompress");
            this.fp_ += numBytesMask;
        }
    };
    Lerc2Decoder.prototype.readTiles_ = function () {
        if (this.headerInfo_.version > 1 &&
            (this.headerInfo_.lercDataType === Lerc2DataType.BYTE || this.headerInfo_.lercDataType === Lerc2DataType.CHAR) &&
            this.headerInfo_.maxZError === 0.5) {
        }
        var mbSize = this.headerInfo_.microBlockSize;
        var height = this.headerInfo_.height;
        var width = this.headerInfo_.width;
        var numTilesVertical = parseInt(((height + mbSize - 1) / mbSize));
        var numTilesHorizontal = parseInt(((width + mbSize - 1) / mbSize));
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
    };
    Lerc2Decoder.prototype.readTile_ = function (i0, i1, j0, j1) {
        var ptr = this.fp_;
        var compareFlag = this.bufferDataView_.getUint8(ptr);
        ptr++;
        var numPixel = 0;
        var bits67 = compareFlag >> 6;
        var testCode = (compareFlag >> 2) & 15;
        if (testCode != ((j0 >> 3) & 15)) {
            throw "Read tile integrity check failed";
        }
        compareFlag &= 3;
        if (compareFlag === 2) {
            for (var i = i0; i < i1; i++) {
                var k = i * this.headerInfo_.width + j0;
                for (var j = j0; j < j1; j++, k++)
                    this.setPixelValuesByHeaderInfoDataType_(k, 0);
            }
            this.fp_ = ptr;
            return;
        }
        else if (compareFlag === 0) {
            var srcPtr = ptr;
            for (var i = i0; i < i1; i++) {
                var k = i * this.headerInfo_.width + j0;
                for (var j = j0; j < j1; j++, k++) {
                    if (this.headerInfo_.lercDataType === Lerc2DataType.FLOAT) {
                        this.setPixelValuesByHeaderInfoDataType_(k, this.bufferDataView_.getFloat32(srcPtr, true));
                        srcPtr += 4;
                    }
                    else if (this.headerInfo_.lercDataType === Lerc2DataType.INT) {
                        this.setPixelValuesByHeaderInfoDataType_(k, this.bufferDataView_.getInt32(srcPtr, true));
                        srcPtr += 4;
                    }
                    else if (this.headerInfo_.lercDataType === Lerc2DataType.USHORT) {
                        this.setPixelValuesByHeaderInfoDataType_(k, this.bufferDataView_.getUint16(srcPtr, true));
                        srcPtr += 2;
                    }
                    else if (this.headerInfo_.lercDataType === Lerc2DataType.SHORT) {
                        this.setPixelValuesByHeaderInfoDataType_(k, this.bufferDataView_.getInt16(srcPtr, true));
                        srcPtr += 2;
                    }
                    else {
                        throw "Lerc2DataType rather than FLOAT, INT is not supported yet";
                    }
                    numPixel++;
                }
            }
            ptr += numPixel * this.sizeofHeaderInfoDataType_();
        }
        else {
            var dataTypeUsed = this.getDataTypeUsed_(bits67);
            var vdt = this.readVariableDataType_(ptr, dataTypeUsed);
            var offset = vdt.offset;
            ptr = vdt.ptr;
            if (compareFlag === 3) {
                for (var i = i0; i < i1; i++) {
                    var k = i * this.headerInfo_.width + j0;
                    for (var j = j0; j < j1; j++, k++) {
                        this.setPixelValuesByHeaderInfoDataType_(k, offset);
                    }
                }
            }
            else {
                this.bitStuff2Util_.setFilePosition(ptr);
                var bitDecodeResult = this.bitStuff2Util_.decode();
                var bufferArray = bitDecodeResult.data;
                var bufferArrayDv = new DataView(bufferArray.buffer);
                ptr = bitDecodeResult.filePosition;
                var invScale = 2 * this.headerInfo_.maxZError;
                var srcPos = 0;
                if (bufferArray.length == (i1 - i0) * (j1 - j0)) {
                    for (var i = i0; i < i1; i++) {
                        var k = i * this.headerInfo_.width + j0;
                        for (var j = j0; j < j1; j++, k++) {
                            var z = offset + bufferArrayDv.getUint32(srcPos, true) * invScale;
                            srcPos += 4;
                            this.setPixelValuesByHeaderInfoDataType_(k, (math.min(z, this.headerInfo_.zMax)));
                        }
                    }
                }
                else {
                    for (var i = i0; i < i1; i++) {
                        var k = i * this.headerInfo_.width + j0;
                        for (var j = j0; j < j1; j++, k++) {
                            var z = offset + bufferArray[srcPos] * invScale;
                            srcPos++;
                            this.setPixelValuesByHeaderInfoDataType_(k, math.min(z, this.headerInfo_.zMax));
                        }
                    }
                }
            }
        }
        this.fp_ = ptr;
    };
    Lerc2Decoder.prototype.getDataTypeUsed_ = function (tc) {
        var dt = this.headerInfo_.lercDataType;
        switch (dt) {
            case Lerc2DataType.SHORT:
            case Lerc2DataType.INT: return dt - tc;
            case Lerc2DataType.USHORT:
            case Lerc2DataType.UINT: return dt - 2 * tc;
            case Lerc2DataType.FLOAT: return tc === 0 ? dt : (tc === 1 ? Lerc2DataType.SHORT : Lerc2DataType.BYTE);
            case Lerc2DataType.DOUBLE: return tc === 0 ? dt : dt - 2 * tc + 1;
            default:
                return dt;
        }
    };
    Lerc2Decoder.prototype.readVariableDataType_ = function (ptr, dataTypeUsed) {
        switch (dataTypeUsed) {
            case Lerc2DataType.CHAR: {
                var c = this.bufferDataView_.getInt8(ptr);
                ptr += 1;
                return { offset: c, ptr: ptr };
            }
            case Lerc2DataType.BYTE: {
                var b = this.bufferDataView_.getUint8(ptr);
                ptr += 1;
                return { offset: b, ptr: ptr };
            }
            case Lerc2DataType.SHORT: {
                var s = this.bufferDataView_.getInt16(ptr, true);
                ptr += 2;
                return { offset: s, ptr: ptr };
            }
            case Lerc2DataType.USHORT: {
                var us = this.bufferDataView_.getUint16(ptr, true);
                ptr += 2;
                return { offset: us, ptr: ptr };
            }
            case Lerc2DataType.INT: {
                var i = this.bufferDataView_.getInt32(ptr, true);
                ptr += 4;
                return { offset: i, ptr: ptr };
            }
            case Lerc2DataType.UINT: {
                var ui = this.bufferDataView_.getUint32(ptr, true);
                ptr += 4;
                return { offset: ui, ptr: ptr };
            }
            case Lerc2DataType.FLOAT: {
                var f = this.bufferDataView_.getFloat32(ptr, true);
                ptr += 4;
                return { offset: f, ptr: ptr };
            }
            case Lerc2DataType.DOUBLE: {
                var d = this.bufferDataView_.getFloat64(ptr, true);
                ptr += 8;
                return { offset: d, ptr: ptr };
            }
            default:
                return { offset: 0, ptr: ptr };
        }
    };
    Lerc2Decoder.prototype.readDataOneSweep_ = function () {
        for (var i = 0; i < this.headerInfo_.height; i++) {
            var k = i * this.headerInfo_.width;
            var cntPixel = 0;
            var srcPtr = this.fp_;
            var sizeofType = 0;
            for (var j = 0; j < this.headerInfo_.width; j++, k++) {
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
                    case Lerc2DataType.UINT: {
                        sizeofType = 4;
                        this.setPixelValuesByHeaderInfoDataType_(k, this.bufferDataView_.getUint32(srcPtr, true));
                        srcPtr += 4;
                        cntPixel++;
                        break;
                    }
                    case Lerc2DataType.USHORT: {
                        sizeofType = 2;
                        this.setPixelValuesByHeaderInfoDataType_(k, this.bufferDataView_.getUint16(srcPtr, true));
                        srcPtr += 2;
                        cntPixel++;
                        break;
                    }
                    case Lerc2DataType.SHORT: {
                        sizeofType = 2;
                        this.setPixelValuesByHeaderInfoDataType_(k, this.bufferDataView_.getInt16(srcPtr, true));
                        srcPtr += 2;
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
                        throw "Unsupported type " + this.headerInfo_.lercDataType + " in readDataOneSweep_";
                }
            }
            this.fp_ = cntPixel * sizeofType;
        }
    };
    Lerc2Decoder.prototype.setPixelValues_ = function (position, value, dataType) {
        switch (dataType) {
            case Lerc2DataType.FLOAT: {
                this.pixelValuesDataView_.setFloat32(position * 4, value, true);
                break;
            }
            case Lerc2DataType.INT: {
                this.pixelValuesDataView_.setInt32(position * 4, parseInt((value)), true);
                break;
            }
            case Lerc2DataType.UINT: {
                this.pixelValuesDataView_.setUint32(position * 4, parseInt((value)), true);
                break;
            }
            case Lerc2DataType.USHORT: {
                this.pixelValuesDataView_.setUint16(position * 2, parseInt((value)), true);
                break;
            }
            case Lerc2DataType.SHORT: {
                this.pixelValuesDataView_.setInt16(position * 2, parseInt((value)), true);
                break;
            }
            case Lerc2DataType.BYTE: {
                this.pixelValuesDataView_.setUint8(position, value);
                break;
            }
            default:
                throw "Unsupported data type in setPixelValues_ " + this.headerInfo_.lercDataType;
        }
    };
    Lerc2Decoder.prototype.setPixelValuesByHeaderInfoDataType_ = function (position, value) {
        this.setPixelValues_(position, value, this.headerInfo_.lercDataType);
    };
    Lerc2Decoder.prototype.sizeofHeaderInfoDataType_ = function () {
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
    };
    Lerc2Decoder.nameFromDataType_ = function (dataType) {
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
    };
    Lerc2Decoder.FILE_KEY_ = "Lerc2 ";
    return Lerc2Decoder;
}());
exports.Lerc2Decoder = Lerc2Decoder;

//# sourceMappingURL=lercdecoder2.js.map
