// gulpfile.js
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

var gulp = require('gulp');
var rename = require('gulp-rename');
var ts = require('gulp-typescript');
var tsSourcemaps = require('gulp-sourcemaps');
var browserify = require('gulp-browserify');

// Compile TypeScript files into 'lib/dist/'.
var tsProject = ts.createProject('lib/src/tsconfig.json');
gulp.task('ts', function() {
  var tsResult = tsProject.src()
    .pipe(tsSourcemaps.init())
    .pipe(ts(tsProject));
  return tsResult.js
    .pipe(tsSourcemaps.write('.'))
    .pipe(gulp.dest('lib/dist/'));
});

// Use Browserify to bundle js for front end usage.
gulp.task('js-bytes', ['ts'], function() {
  gulp.src(['demo/lerc_bytes/main.js'])
    .pipe(browserify())
    .pipe(rename('lerc.js'))
    .pipe(gulp.dest('demo/lerc_bytes/'));
});

gulp.task('js-short', ['ts'], function() {
  gulp.src(['demo/lerc_short/main.js'])
    .pipe(browserify())
    .pipe(rename('lerc.js'))
    .pipe(gulp.dest('demo/lerc_short/'));
});

gulp.task('default', ['js-bytes', 'js-short']);
