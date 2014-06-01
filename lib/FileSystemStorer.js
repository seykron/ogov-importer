/** Storer that stores data in a file system directory.
 *
 * @param {String} dataDir Directory to store data. Cannot be null.
 * @constructor
 */
module.exports = function FileSystemStorer(dataDir) {

  /** Manages background operations.
   * @type {Function}
   * @private
   * @fieldOf FileSystemStorer#
   */
  var BackgroundOperation = require("./BackgroundOperation");

  /** Node's FileSystem API.
   * @type {Object}
   * @private
   * @fieldOf FileSystemStorer#
   */
  var fs = require("fs");

  /** Node's Path API.
   * @type {Object}
   * @private
   * @fieldOf FileSystemStorer#
   */
  var path = require("path");

  /** Manages cache background operations.
   * @type {BackgroundOperation}
   * @private
   * @fieldOf FileSystemStorer#
   */
  var backgroundOperation = new BackgroundOperation();

  return {

    /** Stores the specified data object into the file system.
     *
     * @param {String} id Unique id to identify this data. It is used as file
     *    name. Cannot be null or empty.
     * @param {Object} data Object having the data to store. Cannot be null.
     * @param {String} role Role of the specified data. Can be null.
     * @param {Function} callback Callback invoked when the data is already
     *    saved. Cannot be null.
     */
    store: function (id, data, role, callback) {
      var dataFile = path.join(dataDir, id);

      // Contention is delegated to node.
      process.nextTick(function () {
        // TODO(seykron): implement a strategy to balance the directory tree.
        fs.writeFileSync(dataFile, JSON.stringify(data));
        backgroundOperation.end();
      });
      backgroundOperation.start();
      process.nextTick(callback);
    },

    /** Waits until there is no more pending background operations.
     *
     * @param {Function} callback Invoked when there is no pending operations.
     *    Cannot be null.
     */
    wait: backgroundOperation.wait
  }
};
