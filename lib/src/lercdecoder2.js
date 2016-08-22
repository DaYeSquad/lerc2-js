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
        this.fp_ = 0;
        this.headerInfo_ = {};
        this.bitStuff2Util_ = undefined;
        this.pixelValuesDataView_ = undefined;
        this.buffer_ = buffer;
        this.bitStuff2Util_ = new bitstuff2_1.BitStuff2(buffer);
    }
    Lerc2Decoder.prototype.parse = function () {
        // parse header and set lerc2 version to bitStuff2
        this.readHeader_();
        this.bitStuff2Util_.setLerc2Version(this.headerInfo_.version);
        // You can safely skip this step.
        if (!this.isChecksumMatch_())
            throw "Checksum is not matched";
        //TODO(lin.xiaoe.f@gmail.com): Assumes the data type is float.
        this.pixelValuesDataView_ = new DataView(new Uint8Array(this.headerInfo_.height * this.headerInfo_.width * 4).buffer);
        if (this.headerInfo_.numValidPixel === 0)
            return;
        //TODO(lin.xiaoe.f@gmail.com): Read mask, assumes bit mask is all valid now.
        this.readMask_();
        if (this.headerInfo_.zMin === this.headerInfo_.zMax) {
            //TODO(lin.xiaoe.f@gmail.com): Image is const, implement it later.
            throw "Const image is not implemented yet";
        }
        var readDataOneSweepFlag = this.buffer_[this.fp_]; // read flag
        this.fp_++;
        if (readDataOneSweepFlag === 0) {
            this.readTiles_();
        }
        else {
            //TODO(lin.xiaoe.f@gmail.com): ReadTile data one sweep goes for here.
            console.log("Read data one sweep");
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
        var view = new DataView(this.buffer_);
        this.headerInfo_.version = view.getInt32(6, true); // Int 4
        this.headerInfo_.checksum = view.getUint32(10, true); // UInt 4
        this.headerInfo_.height = view.getInt32(14, true); // Int 4
        this.headerInfo_.width = view.getInt32(18, true); // Int 4
        this.headerInfo_.numValidPixel = view.getInt32(22, true); // Int 4
        this.headerInfo_.microBlockSize = view.getInt32(26, true); // Int 4
        this.headerInfo_.blobSize = view.getInt32(30, true); // Int 4
        this.headerInfo_.lercDataType = view.getInt32(34, true); // Int 4
        this.headerInfo_.maxZError = view.getFloat64(38, true); // Double 8
        this.headerInfo_.zMin = view.getFloat64(46, true); // Double 8
        this.headerInfo_.zMax = view.getFloat64(54, true); // Double 8
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
        var dataView = new DataView(this.buffer_);
        var numBytesMask = dataView.getInt32(this.fp_, true);
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
        var compareFlag = this.buffer_[this.fp_++];
        var bits67 = compareFlag >> 6;
        var testCode = (compareFlag >> 2) & 15; // use bits 2345 for integrity check
        if (testCode != ((j0 >> 3) & 15)) {
            throw "Read tile integrity check failed";
        }
        compareFlag &= 3;
        if (compareFlag === 2) {
            //TODO(lin.xiaoe.f@gmail.com): entire tile is constant 0.
            throw "entire tile is constant 0 is not supported yet";
        }
        else if (compareFlag === 0) {
            //TODO(lin.xiaoe.f@gmail.com): raw binary.
            throw "raw binary is not supported yet";
        }
        else {
            var dataTypeUsed = this.getDataTypeUsed_(bits67);
            var offset = this.readVariableDataType_(dataTypeUsed);
            if (compareFlag === 3) {
                for (var i = i0; i < i1; i++) {
                    var k = i * this.headerInfo_.width + j0;
                    for (var j = j0; j < j1; j++, k++) {
                        // if (bitMask.IsValid(k))
                        if (this.headerInfo_.lercDataType === Lerc2DataType.FLOAT) {
                            this.pixelValuesDataView_.setFloat32(k * 4, offset, true);
                        }
                        else {
                            throw "Lerc2DataType rather than FLOAT is not supported yet";
                        }
                    }
                }
            }
            else {
                this.bitStuff2Util_.setFilePosition(this.fp_);
                var bitDecodeResult = this.bitStuff2Util_.decode();
                var bufferArray = bitDecodeResult.data;
                this.fp_ = bitDecodeResult.filePosition;
                var invScale = 2 * this.headerInfo_.maxZError;
                var srcPos = 0;
                if (bufferArray.length == (i1 - i0) * (j1 - j0)) {
                    for (var i = i0; i < i1; i++) {
                        var k = i * this.headerInfo_.width + j0;
                        for (var j = j0; j < j1; j++, k++) {
                            var z = offset + bufferArray[srcPos++] * invScale;
                            if (this.headerInfo_.lercDataType === Lerc2DataType.FLOAT) {
                                this.pixelValuesDataView_.setFloat32(k * 4, math.min(z, this.headerInfo_.zMax), true);
                            }
                            else {
                                throw "Lerc2DataType rather than FLOAT is not supported yet";
                            }
                        }
                    }
                }
                else {
                    for (var i = i0; i < i1; i++) {
                        var k = i * this.headerInfo_.width + j0;
                        for (var j = j0; j < j1; j++, k++) {
                            // if (m_bitMask.IsValid(k))
                            var z = offset + bufferArray[srcPos++] * invScale;
                            if (this.headerInfo_.lercDataType === Lerc2DataType.FLOAT) {
                                this.pixelValuesDataView_.setFloat32(k, math.min(z, this.headerInfo_.zMax), true);
                            }
                            else {
                                throw "Lerc2DataType rather than FLOAT is not supported yet";
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
     * @param dataTypeUsed The dataTypeUsed.
     * @returns {*} offset
     * @private
     */
    Lerc2Decoder.prototype.readVariableDataType_ = function (dataTypeUsed) {
        switch (dataTypeUsed) {
            case Lerc2DataType.CHAR: {
                var c = this.buffer_[this.fp_];
                this.fp_ += 1;
                return c;
            }
            case Lerc2DataType.BYTE: {
                var b = this.buffer_[this.fp_];
                this.fp_ += 1;
                return b;
            }
            case Lerc2DataType.SHORT: {
                var dv = new DataView(this.buffer_);
                var s = dv.getInt16(this.fp_, true);
                this.fp_ += 2;
                return s;
            }
            case Lerc2DataType.USHORT: {
                var dv = new DataView(this.buffer_);
                var us = dv.getUint16(this.fp_, true);
                this.fp_ += 2;
                return us;
            }
            case Lerc2DataType.INT: {
                var dv = new DataView(this.buffer_);
                var i = dv.getInt32(this.fp_, true);
                this.fp_ += 4;
                return i;
            }
            case Lerc2DataType.UINT: {
                var dv = new DataView(this.buffer_);
                var ui = dv.getUint32(this.fp_, true);
                this.fp_ += 4;
                return ui;
            }
            case Lerc2DataType.FLOAT: {
                var dv = new DataView(this.buffer_);
                var f = dv.getFloat32(this.fp_, true);
                this.fp_ += 4;
                return f;
            }
            case Lerc2DataType.DOUBLE: {
                var dv = new DataView(this.buffer_);
                var d = dv.getFloat64(this.fp_, true);
                this.fp_ += 4;
                return d;
            }
            default:
                return 0;
        }
    };
    Lerc2Decoder.FILE_KEY_ = "Lerc2 ";
    return Lerc2Decoder;
}());
exports.Lerc2Decoder = Lerc2Decoder;
//# sourceMappingURL=lercdecoder2.js.map