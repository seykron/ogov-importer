/** History manager. It reads entries from the specified file and it stores
 * changes and new items with the storer by using the json-diff-patch format.
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

  /** Index of items.
   */
  var index = {};

  var indexSize = 0;

  var buffer = new Buffer(0);

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

  var getEntry = function (key) {
    var items = null;
    var positions = index[key] || null;

    if (positions) {
      items = [];
      positions.forEach(position => {
        items.push(JSON.parse(buffer.slice(position.start, position.end)));
      });

      items.sort((item1, item2) => filters.compare(item1, item2));
    }

    return items;
  };

  return {
    load () {
      debug("initializing history");

      initBuffer();

      return buildIndex();
    },

    push (key, item) {
      return new Promise((resolve, reject) => {
        var items;
        var diff;

        if (index.hasOwnProperty(key)) {
          items = getEntry(key);

          if (filters.changed(items, item)) {
            diff = jsondiffpatch.diff(items.pop(), item);

            debug("item changed: %s", key);

            resolve(storer.store(key, {
              type: "change",
              diff: diff
            }));
          } else {
            resolve();
          }
        } else {
          // TODO(seykron): implement insert.
          debug("new item: %s", item);
          reject(new Error("No yet implemented."));
        }
      });
    },

    size () {
      return indexSize;
    }
  };
};
