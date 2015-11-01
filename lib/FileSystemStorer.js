/** Storer that stores data in a bundle file.
 *
 * It supports a transformer, which allows to merge new items with existing ones
 * before saving.
 *
 * @param {String} dataFile Bundle file to write items to. Cannot be null.
 * @param {Transformer} [transformer] Transformer to merge new items before
 *    saving.
 * @constructor
 */
module.exports = function FileSystemStorer(dataFile, transformer) {

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Default class logger. */
  var debug = require("debug")("file_system_storer");

  /** Node's FileSystem API.
   * @type {Object}
   * @private
   * @fieldOf FileSystemStorer#
   */
  var fs = require("fs");

  /** Control flow library. */
  var async = require("async");

  /** File to store all bills.
   * @constant
   * @private
   */
  var BUNDLE_FILE = dataFile || "all.json";

  /** Bundle file write stream.
   * @type {Stream}
   * @private
   * @fieldOf FileSystemStorer#
   */
  var bundleStream = (function () {
    var stream = fs.createWriteStream(BUNDLE_FILE);
    stream.write("[");
    return stream;
  }());

  var writeItem = function (id, item) {
    var jsonData = JSON.stringify(item);

    debug("storing item %s", id);
    bundleStream.write(jsonData);
    bundleStream.write(",");
  };

  return {

    /** Stores the specified data object into the file system.
     *
     * @param {String} id Unique id to identify this data. It is used as file
     *    name. Cannot be null or empty.
     * @param {Object} data Object having the data to store. Cannot be null.
     * @param {String} role Role of the specified data. Can be null.
     */
    store (id, data, role) {
      return new Promise((resolve, reject) => {
        if (transformer) {
          resolve(transformer.merge(data).then(item => writeItem(id, item)));
        } else {
          writeItem(id, data);
          resolve();
        }
      });
    },

    /** Closes and clean up this storer.
     */
    close () {
      bundleStream.write(JSON.stringify({ done: true }) + "]");
      bundleStream.end();
    }
  };
};
