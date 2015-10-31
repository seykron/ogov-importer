module.exports = function JsonFileDataProvider (key, options) {

  /** Default logger. */
  var debug = require("debug")("json_data_provider");

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Data importer utility. */
  var DataProvider = require("../DataProvider");

  /** Node file system API. */
  var fs = require("fs");

  /** Default configuration. */
  var config = Object.assign({
    map: item => item
  }, options);

  /** Reads the items from the specified JSON file.
   */
  var fetch = function () {
    return new Promise((resolve, reject) => {
      debug("reading items from JSON file: %s", config.file);

      fs.readFile(config.file, (err, data) => {
        if (err)
          reject(err);
        else
          resolve(JSON.parse(data));
      });
    });
  };

  var dataProvider = new DataProvider(key, fetch, config.map);

  return {
    load () {
      return dataProvider.load();
    },
    merge (item) {
      return dataProvider.merge(item);
    },
    close () {
    }
  };
};
