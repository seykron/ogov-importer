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
        debug("reading items from JSON file: %s", options.file);

        fs.readFile(options.file, (err, data) => {
          if (err)
            reject(err);
          else
            resolve(JSON.parse(data));
        });
      });
    },
    close () {
    }
  };
};
