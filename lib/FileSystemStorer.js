/** Storer that stores data in a file system directory.
 *
 * In order to balance the directory tree, this parameter specifies how many
 * levels of directories are managed by this storer. If it is specified,
 * directory name for each level is taken from the item id.
 *
 * @param {String} dataDir Directory to store data. Cannot be null.
 * @param {Number} [options.deph] Number of directory levels to balance the
 *    tree. Default is 0, which means the root data dir will store all items.
 * @constructor
 */
module.exports = function FileSystemStorer(dataDir, options) {

  /** Number of directory levels to balance the tree.
   * @constant
   * @private
   * @fieldOf FileSystemStorer#
   */
  var DEPH = (options && options.deph) || 0;

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

  /** Manages cache background operations.
   * @param {String} id Item id. Cannot be null or empty.
   * @return {String} The
   * @private
   * @methodOf FileSystemStorer#
   */
  var generateFileName = function (id) {
    var itemDir = dataDir;
    var i;

    for (i = 0; i < DEPH; i++) {
      itemDir = path.join(itemDir, id.substr(i * 2, 2));

      if (!fs.existsSync(itemDir)) {
        fs.mkdirSync(itemDir);
      }
    }
    return path.join(itemDir, id);
  };

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
      var dataFile = generateFileName(id);

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
  };
};
