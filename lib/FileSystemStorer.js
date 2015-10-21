/** Storer that stores data in a bundle file.
 *
 * @param {String} dataFile Bundle file to write items to. Cannot be null.
 * @constructor
 */
module.exports = function FileSystemStorer(dataFile) {

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
        var jsonData = JSON.stringify(data);

        debug("storing item %s", id);
        bundleStream.write(jsonData);
        bundleStream.write(",");

        resolve();
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
