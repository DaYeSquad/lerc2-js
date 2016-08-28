"use strict";
var BitStuff2 = (function () {
    function BitStuff2(buffer) {
        this.lerc2Version_ = 0;
        this.buffer_ = undefined;
        this.fp_ = 0;
        this.buffer_ = buffer;
    }
    BitStuff2.prototype.setLerc2Version = function (lerc2Version) {
        this.lerc2Version_ = lerc2Version;
    };
    BitStuff2.prototype.setFilePosition = function (fp) {
        this.fp_ = fp;
    };
    BitStuff2.prototype.decode = function () {
        var dataArray = new Uint32Array(0);
        var numBitsByte = this.buffer_[this.fp_];
        this.fp_++;
        var bits67 = numBitsByte >>> 6;
        var n = (bits67 === 0) ? 4 : 3 - bits67;
        var doLut = (numBitsByte & (1 << 5)) ? true : false;
        numBitsByte &= 31;
        var numElements = this.decodeUInt_(n);
        var numBits = numBitsByte;
        if (!doLut) {
            if (numBits > 0) {
                if (this.lerc2Version_ >= 3) {
                    dataArray = this.unstuff_(numElements, numBits);
                }
                else {
                    throw "BitStuff2 decode failed because of unsupported lerc2 version (we are supporting version 3 and later";
                }
            }
        }
        else {
            var nLutByte = this.buffer_[this.fp_];
            this.fp_++;
            var nLut = nLutByte - 1;
            var tmpLutArray;
            if (this.lerc2Version_ >= 3) {
                tmpLutArray = this.unstuff_(nLut, numBits);
            }
            else {
                throw "BitStuff2 decode failed because of unsupported lerc2 version";
            }
            var nBitsLut = 0;
            while (nLut >> nBitsLut) {
                nBitsLut++;
            }
            if (this.lerc2Version_ >= 3) {
                dataArray = this.unstuff_(numElements, nBitsLut);
            }
            var tmpLutArray2 = new Uint32Array(tmpLutArray.length + 1);
            tmpLutArray2[0] = 0;
            for (var i = 0; i < numElements; i++) {
                tmpLutArray2[i + 1] = tmpLutArray[i];
            }
            for (var i = 0; i < numElements; i++) {
                dataArray[i] = tmpLutArray2[dataArray[i]];
            }
        }
        return { data: dataArray, filePosition: this.fp_ };
    };
    BitStuff2.prototype.decodeUInt_ = function (numFixedLengthValue) {
        var numElements = 0;
        if (numFixedLengthValue === 1) {
            numElements = this.buffer_[this.fp_];
        }
        else if (numFixedLengthValue === 2) {
            var dv = new DataView(this.buffer_);
            numElements = dv.getUint16(this.fp_);
        }
        else if (numFixedLengthValue === 4) {
            var dv = new DataView(this.buffer_);
            numElements = dv.getUint32(this.fp_);
        }
        else {
            throw "BitStuff2 DecodeUInt failed";
        }
        this.fp_ += numFixedLengthValue;
        return numElements;
    };
    BitStuff2.prototype.unstuff_ = function (numElements, numBits) {
        var dataArray = new Uint32Array(numElements);
        var numUInts = parseInt(((numElements * numBits + 31) / 32));
        var numBytes = numUInts * 4;
        var bitStuffDv = new DataView(new Uint32Array(numUInts).buffer);
        bitStuffDv.setUint32(numUInts * 4 - 4, 0, true);
        var numBytesUsed = numBytes - BitStuff2.numTailBytesNotNeeded_(numElements, numBits);
        for (var i = 0; i < numBytesUsed; i++) {
            bitStuffDv.setUint8(i, this.buffer_[this.fp_ + i]);
        }
        var srcPos = 0;
        var dstPos = 0;
        var destDataView = new DataView(dataArray.buffer);
        var bitPos = 0;
        var nb = 32 - numBits;
        for (var i = 0; i < numElements; i++) {
            if (nb - bitPos >= 0) {
                var srcVal = bitStuffDv.getUint32(srcPos, true);
                var dstVal = (srcVal << (nb - bitPos)) >>> nb;
                destDataView.setUint32(dstPos, dstVal, true);
                dstPos += 4;
                bitPos += numBits;
                if (bitPos === 32) {
                    srcPos += 4;
                    bitPos = 0;
                }
            }
            else {
                var dstVal = bitStuffDv.getUint32(srcPos, true) >>> bitPos;
                destDataView.setUint32(dstPos, dstVal, true);
                srcPos += 4;
                var tmpVal = bitStuffDv.getUint32(srcPos, true) << (64 - numBits - bitPos) >>> nb;
                destDataView.setUint32(dstPos, dstVal |= tmpVal, true);
                dstPos += 4;
                bitPos -= nb;
            }
        }
        this.fp_ += numBytesUsed;
        return dataArray;
    };
    BitStuff2.numTailBytesNotNeeded_ = function (numElements, numBits) {
        var numBitsTail = (numElements * numBits) & 31;
        var numBytesTail = (numBitsTail + 7) >>> 3;
        return (numBytesTail > 0) ? 4 - numBytesTail : 0;
    };
    return BitStuff2;
}());
exports.BitStuff2 = BitStuff2;

//# sourceMappingURL=bitstuff2.js.map
