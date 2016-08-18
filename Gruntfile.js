module.exports = function(grunt) {
    require('load-grunt-tasks')(grunt); // npm install --save-dev load-grunt-tasks

    grunt.initConfig({
        babel: {
            options: {
                sourceMap: true,
                presets: ['es2015']
            },
            dist: {
                files: [{
                    expand: true,
                    cwd: 'lib/src',
                    src: ['*.js'],
                    dest: 'lib/dist/'
                }]
            }
        }
    });

    grunt.loadNpmTasks("grunt-babel");

    grunt.registerTask('default', ['babel']);
};


