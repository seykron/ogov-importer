/** Storer that stores bills in a file system directory.
 * @param {String} billsDir Directory to store bills. Cannot be null.
 * @constructor
 */
module.exports = function FileSystemStorer(billsDir) {

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

    /** Stores the specified bill into the file system.
     * @param {Object} billData Bill to store. Cannot be null.
     * @param {Function} callback Callback invoked when the bill is already
     *    saved. Cannot be null.
     */
    store: function (billData, callback) {
      var billFile = path.join(billsDir, billData.bill.file);

      process.nextTick(function () {
        fs.writeFileSync(billFile, JSON.stringify(billData));
        backgroundOperation.end();
      });
      backgroundOperation.start();
      callback();
    },

    /** Waits until there is no more pending background operations.
     *
     * @param {Function} callback Invoked when there is no pending operations.
     *    Cannot be null.
     */
    wait: backgroundOperation.wait
  }
};
