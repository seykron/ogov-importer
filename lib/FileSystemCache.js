/** Query cache that stores results in the file system. Write operations are
 * made in background in order to increase performance.
 *
 *
 * @param {String} cacheDir Directory to store cache entries. Cannot be null or
 *    empty.
 * @constructor
 */
module.exports = function FileSystemCache(cacheDir) {

  /** Suffix for store binary streams.
   * @constant
   * @private
   * @fieldOf FileSystemCache#
   */
  var STREAM_SUFFIX = ".bin";

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

  /** Simple HTTP client for node.
   * @type {Function}
   * @private
   * @fieldOf FileSystemCache#
   */
  var request = require("request");

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
     * @param {Object} [data] Entry value. If it is null, this cache will try
     *    to fetch the url defined by <code>key</code>.
     * @param {Function} [theCallback] Invoked when the cache entry is
     *    successfully stored. It takes an error as parameter.
     */
    put: function (key, data, theCallback) {
      var mustFetch = !data || (typeof data === "function");
      var callback = (typeof data === "function") ? data : theCallback;
      var keyId = generateKeyId(key);
      var entryFile = path.join(cacheDir, keyId);

      process.nextTick(function () {
        var stream;
        var fileStream;

        if (mustFetch) {
          stream = request(key, function (err) {
            if (err && callback) {
              callback(err);
            }
          });
          stream.on("end", function () {
            // Maybe it is a node bug with file streams, we need to wait until
            // IO operations finish.
            setTimeout(function () {
              fileStream.end();
              if (callback) {
                callback(null);
              }
            }, 0);
          });
          fileStream = fs.createWriteStream(entryFile + STREAM_SUFFIX);
          stream.pipe(fileStream);
        } else {
          fs.writeFileSync(entryFile, JSON.stringify(data));
        }
      });

      if (callback && !mustFetch) {
        process.nextTick(callback);
      }
    },

    /** Reads an entry from the cache.
     * @param {Object} key Entry key. Cannot be null.
     * @param {Function} callback Invoked to provide the entry value. It takes
     *    an error and the entry value as parameters. If the entry is a binary
     *    stream, it takes a stream to read the file instead of the value.
     *    Cannot be null.
     */
    get: function (key, callback) {
      var keyId = generateKeyId(key);
      var entryFile = path.join(cacheDir, keyId);

      if (fs.existsSync(entryFile + STREAM_SUFFIX)) {
        process.nextTick(function () {
          callback(null, fs.createReadStream(entryFile + STREAM_SUFFIX, {
            flags: 'r'
          }));
        });
      } else {
        fs.readFile(entryFile, function (err, buffer) {
          if (err) {
            callback(err);
          } else {
            callback(null, JSON.parse(buffer.toString()));
          }
        });
      }
    },

    /** Determines whether the specified key exists in the cache.
     *
     * @param {String} key Key of the entry to verify. Cannot be null or empty.
     * @param {Function} callback Receives an error and a boolean indicating
     *    whether the entry exists in the cache. Cannot be null.
     */
    exists: function (key, callback) {
      var keyId = generateKeyId(key);
      var entryFile = path.join(cacheDir, keyId);

      process.nextTick(function () {
        callback(null, fs.existsSync(entryFile) ||
          fs.existsSync(entryFile + STREAM_SUFFIX));
      });
    }
  };
};
