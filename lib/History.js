/** History storer. It reads entries from the specified bundle file and it
 * stores changes and new items into a delta file.
 *
 * For convenience, each history entry contains the original item and the diff
 * generted by json-diff-patch.
 *
 * @param {String} dataFile Bundle file to read original items from. Cannot be
 *    null or empty.
 * @param {FileSystemStorer} storer Storer to write history entries. Cannot be
 *    null.
 * @param {Function} filters.changed Compares two items and indicates whether
 *    the changed. Cannot be null.
 * @param {Function} filters.compare Compares two items to sort them within an
 *    Array. Cannot be null.
 * @param {String} options.indexKeyName Name of the attribute within the model
 *    object to use as the key for the index. Cannot be null.
 * @param {Number} [options.maxBufferSize] Max size of the file to load into
 *    memory. Default is 200MB.
 */
module.exports = function History(dataFile, storer, filters, options) {

  /** Opening bracket character code. */
  const OPENING_BRACKET = 0x7B;
  /** Closing bracket character code. */
  const CLOSING_BRACKET = 0x7D;
  /** Estimated size of a single index entry in memory. */
  const ESTIMATED_ENTRY_SIZE = 20;

  /** Default class logger. */
  var debug = require("debug")("history");

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** JSON stream parser. */
  var JSONStream = require('JSONStream');

  /** Node's FileSystem API.
   * @type {Object}
   */
  var fs = require("fs");

  /** Node's Path API.
   * @type {Object}
   */
  var path = require("path");

  /** Object diff library. */
  var jsondiffpatch = require('jsondiffpatch').create(options);

  /** Default configuration. */
  var config = Object.assign({
    indexKeyName: "key",
    maxBufferSize: 1024 * 1024 * 200 // 200MB
  }, options);

  /** Index of history items. */
  var index = {};

  /** Estimated index size. */
  var indexSize = 0;

  /** Raw data loaded from the bundle file. */
  var buffer = new Buffer(0);

  /** Dynamic buffer to write new items. */
  var newItemsBuffer = new Buffer("N");

  /** Loads the bundle file into the buffer. It reads the entire file into the
   * buffer.
   */
  var initBuffer = function () {
    var size = fs.statSync(dataFile).size;

    debug("loading data file into memory buffer: %s", dataFile);

    if (size > config.maxBufferSize) {
      // TODO(seykron): support buffering larger files.
      return reject(new Error("File size is larger than supported: " +
        config.maxBufferSize));
    }

    buffer = fs.readFileSync(dataFile);

    debug("data file loaded into memory");
  };

  /** Creates the index. The index consist of a map from a user-specific key to
   * the position within the buffer where the item starts and ends. Items are
   * read lazily when it is required.
   */
  var buildIndex = function () {
    return new Promise((resolve, reject) => {
      var startTime = Date.now();
      var position;
      var cursor = -1;
      var markerStart = -1;
      var markerEnd = -1;
      var key;
      var jsonItem;
      var indexKeyExpr = new RegExp("\"" + config.indexKeyName + "\"\:\"(.+?)\"");

      debug("creating index");

      for (position = 0; position < buffer.length; position++) {
        if (buffer[position] == OPENING_BRACKET) {
          cursor += 1;

          if (cursor == 0) {
            markerStart = position;
          }
        }
        if (buffer[position] == CLOSING_BRACKET) {
          cursor -= 1;

          if (cursor == -1 && markerStart > markerEnd) {
            markerEnd = position + 1;

            try {
              jsonItem = buffer.slice(markerStart, markerEnd).toString();

              if (indexKeyExpr.test(jsonItem)) {
                key = jsonItem.match(indexKeyExpr).pop();

                if (index.hasOwnProperty(key)) {
                  index[key].push({start: markerStart, end: markerEnd});
                } else {
                  index[key] = [{start: markerStart, end: markerEnd}];
                }

                indexSize += ESTIMATED_ENTRY_SIZE;
              }
            } catch(e) {
              console.log("cannot parse object: %s",
                buffer.slice(markerStart, markerEnd).toString())
            }
          }
        }
      }

      debug("index ready (took %s secs)", (Date.now() - startTime) / 1000);

      resolve();
    });
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
          rawItem = buffer.slice(position.start, position.end);
          items.push(JSON.parse(rawItem));
        }
      });

      items.sort((item1, item2) => filters.compare(item1, item2));
    }

    return items;
  };

  /** Calculates changes on an existing item.
   * @param {String} key Key of the item in the index. Cannot be null or empty.
   * @param {Object} item Item to compare. Cannot be null.
   */
  var changed = function (key, item) {
    return new Promise((resolve, reject) => {
      var items = getEntry(key);
      var hasChanged = filters.changed(items, item);
      var lastItem;
      var diff;

      if (hasChanged) {
        lastItem = items.pop();
        diff = jsondiffpatch.diff(lastItem, item);

        debug("item changed: %s", key);

        resolve(storer.store(key, {
          id: key,
          type: "change",
          item: lastItem,
          delta: diff
        }));
      } else {
        resolve();
      }
    });
  };

  /** Adds a new item into the index.
   *
   * @param {String} key Index key of the new item. Cannot be null or empty.
   * @param {Object} item Item to add. Cannot be null.
   */
  var add = function (key, item) {
    return new Promise((resolve, reject) => {
      var rawItem = new Buffer(JSON.stringify(item));
      var markerStart = newItemsBuffer.length;
      var markerEnd = markerStart + rawItem.length;

      debug("new item: %s", key);

      index[key] = [{start: -markerStart, end: -markerEnd}];
      newItemsBuffer = Buffer.concat([newItemsBuffer, rawItem], markerEnd);

      resolve(storer.store(key, {
        id: key,
        type: "add",
        item: item
      }));
    });
  };

  return {
    load () {
      debug("initializing history");

      initBuffer();

      return buildIndex();
    },

    store (key, item) {
      return new Promise((resolve, reject) => {
        if (index.hasOwnProperty(key)) {
          resolve(changed(key, item));
        } else {
          resolve(add(key, item));
        }
      });
    },

    size () {
      return indexSize;
    },

    close () {
      storer.close();
    }
  };
};
