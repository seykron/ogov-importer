module.exports = function JsonFileDataProvider (options) {

  /** Default logger. */
  var debug = require("debug")("json_data_provider");

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Node file system API. */
  var fs = require("fs");

  return {
    /** Reads the items from the specified JSON file.
     * @return {Promise<Object[]|Error>} a promise to the items, never null.
     */
    list () {
      return new Promise((resolve, reject) => {
        var files = [];
        var items = [];

        if (options.file) {
          files.push(options.file);
        }
        if (Array.isArray(options.files)) {
          files = files.concat(options.files);
        }
        debug("reading items from JSON file(s): %s", files);

        files.forEach(file => {
          items = items.concat(JSON.parse(fs.readFileSync(file)))
        });

        resolve(items);
      });
    },
    close () {
    }
  };
};
