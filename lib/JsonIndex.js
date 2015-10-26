/** Indexes a huge JSON file and allows to lazily retrieve entries. It builds a
 * lightweight index and keeps a range of raw entries in memory to avoid reading
 * from disk. The entries cache is updated and a new range of entries is loaded
 * into memory only when the required item is not in the current buffer.
 *
 * It keeps the dataFile file descriptor opened until close() is explicitly
 * invoked.
 *
 * It reads the JSON file from top to bottom and puts the index entries in the
 * same order, so the best performance is reached when contiguous items are
 * sequentially required.
 *
 * @param {String} dataFile JSON file to read items. Cannot be null or empty.
 * @param {String} options.indexKeyName Name of the attribute within the json
 *    object to use as the key for the index. Cannot be null.
 * @param {Number} [options.bufferSize] Size of the memory buffer to cache
 *    items. Default is 50MB.
 */
module.exports = function JsonIndex(dataFile, options) {

  /** Opening bracket character code. */
  const OPENING_BRACKET = 0x7B;
  /** Closing bracket character code. */
  const CLOSING_BRACKET = 0x7D;
  /** Double quotes character code. */
  const DOUBLE_QUOTE = 0x22;
  /** Backslash character code*/
  const BACKSLASH = 0x5C;

  /** Estimated size of a single index entry in memory. */
  const ESTIMATED_ENTRY_SIZE = 20;
  /** Number of bytes to load into the buffer for parsing. */
  const PARSE_BUFFER_SIZE = 1024 * 1024 * 100;

  /** Default configuration. */
  var config = Object.assign({
    indexKeyName: "key",
    indexKeyMatcher: "\"key\"\:\"(.+?)\"",
    bufferSize: 1024 * 1024 * 50 // 50MB
  }, options);

  /** Default logger. */
  var debug = require("debug")("json_index");

  /** Node's FileSystem API.
   * @type {Object}
   */
  var fs = require("fs");

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Raw data loaded from the bundle file. */
  var buffer = new Buffer(config.bufferSize);

  /** Index of history items. */
  var index = {};

  /** Estimated index size. */
  var indexSize = 0;

  /** Dynamic buffer to write new items. */
  var newItemsBuffer = new Buffer("N");

  /** Data file descriptor. */
  var fd;

  /** Absolute positions in the data file that's currently
   * loaded in the memory buffer.
   */
  var currentRange = {
    start: 0,
    end: 0
  };

  /** Synchrounously updates the cache with a new range of data if the required
   * range is not within the current cache.
   * @param {Number} start Start position of the required range. Cannot be null.
   * @param {Number} end End position of the required range. Cannot be null.
   * @param {Boolean} force Indicates whether to force the cache update.
   */
  var loadBufferIfRequired = function (start, end, force) {
    if (end - start > config.bufferSize) {
      return reject(new Error("Range exceeds the max buffer size"));
    }
    if (force || start < currentRange.start || (start > currentRange.end)) {
      fs.readSync(fd, buffer, 0, config.bufferSize, start);
      currentRange.start = start;
      currentRange.end = start + config.bufferSize;
      debug("buffering new range: %s", JSON.stringify(currentRange));
    }
  };

  var addIndexEntry = function (key, markerStart, markerEnd) {
    var entry = {
      start: markerStart,
      end: markerEnd
    };
    if (index.hasOwnProperty(key)) {
      index[key].push(entry);
    } else {
      index[key] = [entry];
    }
    indexSize += ESTIMATED_ENTRY_SIZE;
  };

  var readAndIndex = function (offsetInfo, buffer) {
    var cursor = (offsetInfo.cursor !== undefined) ? offsetInfo.cursor : -1;
    var inString = offsetInfo.inString;
    var offset = offsetInfo.offset || 0;

    var position = 0;
    var markerStart = -1;
    var markerEnd = -1;
    var key;
    var jsonItem;
    var indexKeyExpr = new RegExp(config.indexKeyMatcher);
    var char;

    while (position < buffer.length) {
      char = buffer[position];

      // Indicates whether the parser is within a string.
      if (char == DOUBLE_QUOTE && buffer[position - 1] != BACKSLASH) {
        inString = !inString;
      }

      if (char == OPENING_BRACKET && !inString) {
        cursor += 1;

        if (cursor == 0) {
          markerStart = position;
        }
      }

      if (char == CLOSING_BRACKET && !inString) {
        cursor -= 1;

        if (cursor == -1 && markerStart > -1) {
          markerEnd = position + 1;

          try {
            jsonItem = buffer.slice(markerStart, markerEnd).toString();

            if (indexKeyExpr.test(jsonItem)) {
              key = jsonItem.match(indexKeyExpr).pop();
              addIndexEntry(key, offset + markerStart, offset + markerEnd);
            } else if (jsonItem.indexOf(config.indexKeyName) > -1) {
              debug("expresion doesn't match '%s': %s", indexKeyExpr, jsonItem);
            }
          } catch(e) {
            debug("cannot parse object: %s",
              buffer.slice(markerStart, markerEnd).toString())
          }
        }
      }

      position += 1;
    }

    return {
      cursor: cursor,
      inString: inString,
      offset: offset + position
    };
  };

  /** Creates the index. The index consist of a map from a user-specific key to
   * the position within the buffer where the item starts and ends. Items are
   * read lazily when it is required.
   */
  var buildIndex = function () {
    return new Promise((resolve, reject) => {
      var startTime = Date.now();
      var bytesRead = 0;

      var size = fs.statSync(dataFile).size;
      var readBuffer;
      var position = {};

      fd = fs.openSync(dataFile, "r");
      debug("creating index");

      while (bytesRead < size) {
        if (size - bytesRead > PARSE_BUFFER_SIZE) {
          readBuffer = new Buffer(PARSE_BUFFER_SIZE);
          bytesRead += fs.readSync(fd, readBuffer, 0, PARSE_BUFFER_SIZE);
          position = readAndIndex(position, readBuffer);
        } else {
          readBuffer = new Buffer(size - bytesRead);
          bytesRead += fs.readSync(fd, readBuffer, 0, size - bytesRead);
          position = readAndIndex(position, readBuffer);
        }
      }

      loadBufferIfRequired(0, config.bufferSize, true);

      debug("indexSize size: %s", (indexSize / 1024) + "KB");
      debug("index ready (took %s secs)", (Date.now() - startTime) / 1000);

      resolve();
    });
  };

  var readEntry = function (start, end) {
    var offsetStart;
    var offsetEnd;

    loadBufferIfRequired(start, end);

    offsetStart = start - currentRange.start;
    offsetEnd = offsetStart + (end - start);

    return buffer.slice(offsetStart, offsetEnd);
  };

  /** Returns an item from the index.
   * @param {String} key Unique key of the required item. Cannot be null.
   */
  var getEntry = function (key) {
    var items = null;
    var positions = index[key] || null;

    if (positions) {
      items = [];
      positions.forEach(position => {
        var rawItem;

        // New items are mapped into the index as negative integers.
        if (position.start < 0) {
          rawItem = newItemsBuffer.slice(Math.abs(position.start),
            Math.abs(position.end));
          items.push(JSON.parse(rawItem));
        } else {
          rawItem = readEntry(position.start, position.end);
          items.push(JSON.parse(rawItem));
        }
      });
    }

    return items;
  };

  return {
    load () {
      return buildIndex();
    },

    getEntry (key) {
      return new Promise((resolve, reject) => {
        resolve(getEntry(key))
      });
    },

    /** Adds a new item into the index.
     *
     * @param {String} key Index key of the new item. Cannot be null or empty.
     * @param {Object} item Item to add. Cannot be null.
     */
    addEntry (key, item) {
      return new Promise((resolve, reject) => {
        var rawItem = new Buffer(JSON.stringify(item));
        var markerStart = newItemsBuffer.length;
        var markerEnd = markerStart + rawItem.length;

        debug("new item: %s", key);

        addIndexEntry(key, -markerStart, -markerEnd);
        newItemsBuffer = Buffer.concat([newItemsBuffer, rawItem], markerEnd);

        resolve();
      });
    },

    size () {
      return indexSize;
    },

    has (key) {
      return index.hasOwnProperty(key);
    },

    close () {
      fs.closeSync(fd);
    }
  };
};
