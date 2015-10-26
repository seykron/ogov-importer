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
 * @param {Number} [options] Options to generate the JsonIndex.
 */
module.exports = function History(dataFile, storer, filters, options) {

  /** Default class logger. */
  var debug = require("debug")("history");

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Object diff library. */
  var jsondiffpatch = require('jsondiffpatch').create(options);

  /** Indexes huge JSON files. */
  var JsonIndex = require("./JsonIndex");

  /** JSON index instance for this history. */
  var jsonIndex = new JsonIndex(dataFile, options);

  /** Calculates changes on an existing item.
   * @param {String} key Key of the item in the index. Cannot be null or empty.
   * @param {Object} item Item to compare. Cannot be null.
   */
  var changed = function (key, item) {
    return jsonIndex.getEntry(key).then(items => {
      var hasChanged = filters.changed(items, item);
      var lastItem;
      var diff;

      if (hasChanged) {
        lastItem = items.pop();
        diff = jsondiffpatch.diff(lastItem, item);

        debug("item changed: %s", key);

        return storer.store(key, {
          id: key,
          type: "change",
          item: lastItem,
          delta: diff
        });
      }
    });
  };

  /** Adds a new item into the index.
   *
   * @param {String} key Index key of the new item. Cannot be null or empty.
   * @param {Object} item Item to add. Cannot be null.
   */
  var add = function (key, item) {
    return jsonIndex.addEntry(key, item).then(() => storer.store(key, {
      id: key,
      type: "add",
      item: item
    }));
  };

  return {
    /** Creates the underlying index and initializes the history.
     * @return {Promise} Returns a promise to the history initialization event.
     */
    load () {
      debug("initializing history");
      return jsonIndex.load();
    },

    /** Adds an entry into the index. If the item exists, it checks whether the
     * item changed and stores the difference into the history. If the item
     * doesn't exist, it stores the new item into the history.
     *
     * @param {String} key History entry key. Cannot be null or empty.
     * @param {Object} item Item to add into the history. Cannot be null.
     */
    store (key, item) {
      return new Promise((resolve, reject) => {
        if (jsonIndex.has(key)) {
          changed(key, item)
            .then(() => resolve())
            .catch(err => debug("error adding history entry %s: %s", key,
              err.stack));
        } else {
          add(key, item)
            .then(() => resolve())
            .catch(err => debug("error saving history entry %s: %s", key,
              err.stack));
        }
      });
    },

    /** Returns the estimated JSON index size in memory.
     */
    size () {
      return jsonIndex.size();
    },

    /** Closes the history and the underlying files.
     */
    close () {
      jsonIndex.close();
      storer.close();
    }
  };
};
