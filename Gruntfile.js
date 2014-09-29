module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    jshint: {
      files: [
        "lib/**/*.js",
        "!lib/es5-shim.min.js"
      ],
      options: {
        curly: true,
        eqeqeq: true,
        immed: true,
        latedef: true,
        newcap: true,
        noarg: true,
        sub: true,
        undef: true,
        boss: true,
        eqnull: true,
        node: true,
        globals: {
          exports: true,
          module: false,
          window: true,
          irc: true,
          io: true
        }
      }
    }
  });

  grunt.loadNpmTasks("grunt-contrib-jshint");

  // Default task.
  grunt.registerTask("default", ["jshint"]);
};
