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
"use strict";
/// <reference path="../../typings/globals/mathjs/index.d.ts" />
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
        this.bitStuff2Util_ = new bitstuff2_1.BitStuff2(buffer);
        this.bufferDataView_ = new DataView(this.buffer_);
    }
    Lerc2Decoder.prototype.parse = function () {
        // parse header and set lerc2 version to bitStuff2
        this.readHeader_();
        console.log("Lerc2 data type is " + Lerc2Decoder.nameFromDataType_(this.headerInfo_.lercDataType));
        this.bitStuff2Util_.setLerc2Version(this.headerInfo_.version);
        // You can safely skip this step.
        if (!this.isChecksumMatch_())
            throw "Checksum is not matched";
        //TODO(lin.xiaoe.f@gmail.com): Assumes the data type is float or int.
        this.pixelValuesDataView_ = new DataView(new Uint8Array(this.headerInfo_.height * this.headerInfo_.width * 4).buffer);
        for (var i = 0; i < this.headerInfo_.width * this.headerInfo_.height; i++) {
            this.pixelValuesDataView_.setInt32(i * 4, 0, true);
        }
        if (this.headerInfo_.numValidPixel === 0)
            return;
        //TODO(lin.xiaoe.f@gmail.com): Read mask, assumes bit mask is all valid now.
        this.readMask_();
        if (this.headerInfo_.zMin === this.headerInfo_.zMax) {
            var z0 = this.headerInfo_.zMin;
            for (var i = 0; i < this.headerInfo_.height; i++) {
                var k = i * this.headerInfo_.width;
                for (var j = 0; j < this.headerInfo_.width; j++) {
                    //TODO(lin.xiaoe.f@gmail.com): if (m_bitMask.IsValid(k))
                    this.setPixelValuesByHeaderInfoDataType_(k, z0, "set const image");
                }
            }
            return { pixelData: this.pixelValuesDataView_.buffer };
        }
        var readDataOneSweepFlag = this.buffer_[this.fp_]; // read flag
        this.fp_++;
        if (readDataOneSweepFlag === 0) {
            this.readTiles_();
        }
        else {
            this.readDataOneSweep_();
        }
        return { pixelData: this.pixelValuesDataView_.buffer };
    };
    /**
     * Get LERC header info, including version, checksum, width, height, numValidPixel, microBlockSize, blobSize,
     * lercDataType, maxZError, zMin, zMax and move the file position to the mask block.
     *
     * @returns {{headerInfo}} LERC header information.
     */
    Lerc2Decoder.prototype.readHeader_ = function () {
        // file header first 6 chars should be "Lerc2", byte offset is 0.
        var bytes = new Uint8Array(this.buffer_, 0, 6);
        this.headerInfo_.fileIdentifierString = String.fromCharCode.apply(null, bytes);
        if (this.headerInfo_.fileIdentifierString != Lerc2Decoder.FILE_KEY_) {
            throw "Unexpected file identifier string: " + this.headerInfo_.fileIdentifierString;
        }
        // lerc stores in little endian
        this.headerInfo_.version = this.bufferDataView_.getInt32(6, true); // Int 4
        this.headerInfo_.checksum = this.bufferDataView_.getUint32(10, true); // UInt 4
        this.headerInfo_.height = this.bufferDataView_.getInt32(14, true); // Int 4
        this.headerInfo_.width = this.bufferDataView_.getInt32(18, true); // Int 4
        this.headerInfo_.numValidPixel = this.bufferDataView_.getInt32(22, true); // Int 4
        this.headerInfo_.microBlockSize = this.bufferDataView_.getInt32(26, true); // Int 4
        this.headerInfo_.blobSize = this.bufferDataView_.getInt32(30, true); // Int 4
        this.headerInfo_.lercDataType = this.bufferDataView_.getInt32(34, true); // Int 4
        this.headerInfo_.maxZError = this.bufferDataView_.getFloat64(38, true); // Double 8
        this.headerInfo_.zMin = this.bufferDataView_.getFloat64(46, true); // Double 8
        this.headerInfo_.zMax = this.bufferDataView_.getFloat64(54, true); // Double 8
        this.fp_ += 62;
    };
    /**
     * Check checksum is match or not, returns true if match.
     * @returns {boolean} true if checksum is the same.
     */
    Lerc2Decoder.prototype.isChecksumMatch_ = function () {
        if (this.headerInfo_.version >= 3) {
            var nChecksumFieldBytes = Lerc2Decoder.FILE_KEY_.length + 8; // start right after the checksum entry
            var checksum = this.computeChecksumFletcher32_(this.headerInfo_.blobSize - nChecksumFieldBytes);
            if (checksum != this.headerInfo_.checksum) {
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
     * @param len Buffer length.
     * @returns {number} Result.
     */
    Lerc2Decoder.prototype.computeChecksumFletcher32_ = function (len) {
        var lercBlobLen = len;
        var sum1 = math.bignumber(0xffff);
        var sum2 = math.bignumber(0xffff);
        var words = parseInt((lercBlobLen / 2)); // fake the typescript compiler
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
    };
    /**
     * Fletcher's checksum with bytes. (https://en.wikipedia.org/wiki/Fletcher's_checksum)
     *
     * Warning, this implementation cannot work but much much much faster than the right one.
     *
     * @param len Buffer length.
     * @returns {number} Result.
     */
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
                sum1 += (this.buffer_[iByte++] << 8);
                sum2 += sum1 += this.buffer_[iByte++];
                console.log(sum2);
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
        console.log("Sum1 is " + sum1 + " ,sum2 is " + sum2);
        // sum2 << 16 | sum1 is greater than INT_MAX use math.js instead.
        var result = math.leftShift(math.bignumber(sum2), 16);
        result = math.bitXor(result, sum1); // result = math.bitOr(result, sum1);
        console.log("Bignumber result is " + result);
        return result;
    };
    /**
     * Read the bit mask of LERC.
     * @private
     */
    Lerc2Decoder.prototype.readMask_ = function () {
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
            console.log("All pixels are invalid");
        }
        else if (numValid === width * height) {
            //TODO(lin.xiaoe.f@gmail.com): Bit Mask is all valid.
            console.log("All pixels are valid");
        }
        else if (numBytesMask > 0) {
            //TODO(lin.xiaoe.f@gmail.com): RLE decompress.
            console.log("Need RLE decompress");
            this.fp_ += numBytesMask;
        }
    };
    /**
     * Read pixel values.
     * @private
     */
    Lerc2Decoder.prototype.readTiles_ = function () {
        if (this.headerInfo_.version > 1 &&
            (this.headerInfo_.lercDataType === Lerc2DataType.BYTE || this.headerInfo_.lercDataType === Lerc2DataType.CHAR) &&
            this.headerInfo_.maxZError === 0.5) {
            //TODO(lin.xiaoe.f@gmail.com): Try Huffman.
            throw "Try Huffman is not implemented yet";
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
    /**
     * Read each block tile.
     * @param i0
     * @param i1
     * @param j0
     * @param j1
     * @private
     */
    Lerc2Decoder.prototype.readTile_ = function (i0, i1, j0, j1) {
        var ptr = this.fp_;
        var compareFlag = this.buffer_[ptr];
        var numPixel = 0;
        ptr++;
        //TODO(lin.xiaoe.f@gmail.com): DEBUG code
        // if (i0 === 104 && i1 === 112 && j0 === 32 && j1 === 40) {
        //   console.log(`CompareFlag is ${compareFlag}`);
        // }
        // if (i0 === 104 && i1 === 112 && j0 === 32 && j1 === 48) {
        //   console.log(`CompareFlag is ${compareFlag}`);
        // }
        //console.log(`i0 ${i0} i1 ${i1} j0 ${j0} j1 ${j1} comprFlag is ${compareFlag}`);
        var bits67 = compareFlag >> 6;
        var testCode = (compareFlag >> 2) & 15; // use bits 2345 for integrity check
        if (testCode != ((j0 >> 3) & 15)) {
            throw "Read tile integrity check failed";
        }
        compareFlag &= 3;
        if (compareFlag === 2) {
            for (var i = i0; i < i1; i++) {
                var k = i * this.headerInfo_.width + j0;
                for (var j = j0; j < j1; j++, k++)
                    //TODO(lin.xiaoe.f@gmail.com): if (m_bitMask.IsValid(k))
                    this.pixelValuesDataView_.setInt32(k * 4, 0, true);
            }
            this.fp_ = ptr;
        }
        else if (compareFlag === 0) {
            for (var i = i0; i < i1; i++) {
                var srcPtr = ptr;
                var k = i * this.headerInfo_.width + j0;
                for (var j = j0; j < j1; j++, k++) {
                    //TODO(lin.xiaoe.f@gmail.com): if (m_bitMask.IsValid(k))
                    if (this.headerInfo_.lercDataType === Lerc2DataType.FLOAT) {
                        this.setPixelValuesByHeaderInfoDataType_(k, this.bufferDataView_.getFloat32(srcPtr, true), "compareFlag0_FLOAT");
                        srcPtr += 4;
                    }
                    else if (this.headerInfo_.lercDataType === Lerc2DataType.INT) {
                        this.setPixelValuesByHeaderInfoDataType_(k, this.bufferDataView_.getInt32(srcPtr, true), "compareFlag0_INT");
                        srcPtr += 4;
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
            // get variable data type and offset.
            var dataTypeUsed = this.getDataTypeUsed_(bits67);
            var vdt = this.readVariableDataType_(ptr, dataTypeUsed);
            var offset = vdt.offset;
            ptr = vdt.ptr;
            if (compareFlag === 3) {
                for (var i = i0; i < i1; i++) {
                    var k = i * this.headerInfo_.width + j0;
                    for (var j = j0; j < j1; j++, k++) {
                        //TODO(lin.xiaoe.f@gmail.com): if (bitMask.IsValid(k))
                        this.setPixelValuesByHeaderInfoDataType_(k, offset, "compareFlag3");
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
                // DEBUG
                // for (let i = 0; i < bufferArray.length; i++) {
                //   console.log(`bufary is ${bufferArray[i]}`);
                // }
                if (bufferArray.length == (i1 - i0) * (j1 - j0)) {
                    for (var i = i0; i < i1; i++) {
                        var k = i * this.headerInfo_.width + j0;
                        for (var j = j0; j < j1; j++, k++) {
                            var z = offset + bufferArrayDv.getUint32(srcPos, true) * invScale;
                            srcPos += 4;
                            this.setPixelValuesByHeaderInfoDataType_(k, (math.min(z, this.headerInfo_.zMax)), "all valid");
                        }
                    }
                }
                else {
                    for (var i = i0; i < i1; i++) {
                        var k = i * this.headerInfo_.width + j0;
                        for (var j = j0; j < j1; j++, k++) {
                            //TODO(lin.xiaoe.f@gmail.com): if (m_bitMask.IsValid(k))
                            var z = offset + bufferArray[srcPos] * invScale;
                            srcPos++;
                            this.setPixelValuesByHeaderInfoDataType_(k, math.min(z, this.headerInfo_.zMax), "compareFlag other, not all valid");
                        }
                    }
                }
            }
        }
        this.fp_ = ptr;
    };
    /**
     * Get data type used in offset.
     * @param tc The bits in 6-7.
     * @returns {*} Data type used in offset.
     * @private
     */
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
    /**
     * Get LERC block header offset variable.
     * @param ptr The position of buffer.
     * @param dataTypeUsed The dataTypeUsed.
     * @returns {*} offset
     * @private
     */
    Lerc2Decoder.prototype.readVariableDataType_ = function (ptr, dataTypeUsed) {
        switch (dataTypeUsed) {
            case Lerc2DataType.CHAR: {
                var c = this.buffer_[ptr];
                ptr += 1;
                return { offset: c, ptr: ptr };
            }
            case Lerc2DataType.BYTE: {
                var b = this.buffer_[ptr];
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
                //TODO: if (m_bitMask.IsValid(k))
                switch (this.headerInfo_.lercDataType) {
                    case Lerc2DataType.BYTE: {
                        sizeofType = 1;
                        this.setPixelValuesByHeaderInfoDataType_(k, this.bufferDataView_.getUint8(srcPtr), "readDataOneSweep_");
                        srcPtr += 1;
                        cntPixel++;
                        break;
                    }
                    case Lerc2DataType.INT: {
                        console.log("Lerc2DataType.INT " + srcPtr);
                        sizeofType = 4;
                        this.setPixelValuesByHeaderInfoDataType_(k, this.bufferDataView_.getInt32(srcPtr, true), "readDataOneSweep_");
                        srcPtr += 4;
                        cntPixel++;
                        break;
                    }
                    case Lerc2DataType.FLOAT: {
                        sizeofType = 4;
                        this.setPixelValuesByHeaderInfoDataType_(k, this.bufferDataView_.getFloat32(srcPtr, true), "readDataOneSweep_");
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
    /**
     * Set pixel value to {@link pixelValuesDataView_}, equivalent to this.pixelValuesDataView_.setXXX with little endian.
     * @param position Position of pixelValues buffer.
     * @param value Value to set.
     * @param dataType DataType used in destination buffer.
     * @private
     */
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
            case Lerc2DataType.BYTE: {
                this.pixelValuesDataView_.setUint8(position, value);
                break;
            }
            default:
                throw "Unsupported data type in setPixelValues_ " + this.headerInfo_.lercDataType;
        }
    };
    /**
     * Set pixel value to {@link pixelValuesDataView_}, equivalent to this.pixelValuesDataView_.setXXX with little endian.
     * The data type used depends on {@link headerInfo_}.
     * @param position Position of pixelValues buffer.
     * @param value Value to set.
     * @private
     */
    // setPixelValuesByHeaderInfoDataType_(position: number, value: number): void {
    //   if (position === 27937) {
    //     console.log(`27937 value is ${value}`);
    //   }
    //   this.setPixelValues_(position, value, this.headerInfo_.lercDataType);
    // }
    Lerc2Decoder.prototype.setPixelValuesByHeaderInfoDataType_ = function (position, value, flag) {
        if (position === 278) {
            console.log("!!!-- 278 value is " + flag);
        }
        this.setPixelValues_(position, value, this.headerInfo_.lercDataType);
    };
    /**
     * Equivalent to sizeof(T) in C.
     * @returns {number} size of type used.
     * @private
     */
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