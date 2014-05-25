/** Query cache that stores results in the file system. Write operations are
 * made in background in order to increase performance.
 *
 *
 * @param {String} cacheDir Directory to store cache entries. Cannot be null or
 *    empty.
 * @constructor
 */
module.exports = function FileSystemCache(cacheDir) {

  /** Manages background operations.
   * @type {Function}
   * @private
   * @fieldOf FileSystemCache#
   */
  var BackgroundOperation = require("./BackgroundOperation");

  /** NodeJS crypto API.
   * @type {Object}
   * @private
   * @fieldOf FileSystemCache#
   */
  var crypto = require("crypto");

  /** Node's FileSystem API.
   * @type {Object}
   * @private
   * @fieldOf FileSystemCache#
   */
  var fs = require("fs");

  /** Node's Path API.
   * @type {Object}
   * @private
   * @fieldOf FileSystemCache#
   */
  var path = require("path");

  /** Manages cache background operations.
   * @type {BackgroundOperation}
   * @private
   * @fieldOf FileSystemCache#
   */
  var backgroundOperation = new BackgroundOperation();

  /** Generates a unique key id for the specified key.
   * @param {Object} key Key to get id. Cannot be null.
   * @return {String} A SHA-1 hash to use as key id, never null or empty.
   * @private
   * @methodOf FileSystemCache#
   */
  var generateKeyId = function (key) {
    var sha = crypto.createHash('sha1');
    var keyId = JSON.stringify(key);
    var entryFile;

    sha.update(keyId);

    return sha.digest("hex");
  };

  return {

    /** Puts an entry into the cache.
     *
     * @param {Object} key Entry key. Cannot be null.
     * @param {Object} data Entry value. Cannot be null.
     * @param {Function} [callback] Invoked when the cache entry is successfully
     *    stored. It takes an error as parameter.
     */
    put: function (key, data, callback) {
      var keyId = generateKeyId(key);
      var entryFile = path.join(cacheDir, keyId);

      process.nextTick(function () {
        fs.writeFileSync(entryFile, JSON.stringify(data));
        backgroundOperation.end();
      });
      backgroundOperation.start();
      if (callback) {
        callback(null);
      }
    },

    /** Reads an entry from the cache.
     * @param {Object} key Entry key. Cannot be null.
     * @param {Function} callback Invoked to provide the entry value. It takes
     *    an error and the entry value as parameters. Cannot be null.
     */
    get: function (key, callback) {
      var keyId = generateKeyId(key);
      var entryFile = path.join(cacheDir, keyId);

      fs.readFile(entryFile, function (err, buffer) {
        if (err) {
          callback(err);
        } else {
          callback(null, JSON.parse(buffer.toString()));
        }
      });
    },

    /** Waits until the cache has no more pending background operations.
     *
     * @param {Function} callback Invoked when the cache has no pending
     *    operations. Cannot be null.
     */
    wait: backgroundOperation.wait
  };
};
