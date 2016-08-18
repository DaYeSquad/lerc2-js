# ReadLerc-JS - Read Lerc2 v3 in javascript

## What is LERC?

LERC is an open-source image or raster format which supports rapid encoding and decoding for any pixel type (not just RGB or Byte) designed by [esri](https://github.com/Esri/lerc).

## Why this project?

The original project just provides Lerc2 encoder and Lerc1 decoder(js), so I migrate its C++ implementation(part of) to javascript.

## How to use

I test it under node environment (version is v0.10.28) and run 'node read' to test.

```Javascript
var LERC = require("./lib/LercCodecV2.js").Lerc;
var fs = require("fs");

var lercData = fs.readFileSync("./test.lerc");
var arrayBuffer = new Uint8Array(lercData).buffer;

var lerc = LERC();
var result = lerc.decode(arrayBuffer);
... do something with result.pixelData...
```
