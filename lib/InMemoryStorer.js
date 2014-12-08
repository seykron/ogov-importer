/** Stores data in memory using a map.
 *
 * @param {Boolean} keepData Indicates whether items will be stored or only
 *    stats about them. By default, this storer only saves stats.
 * @constructor
 */
module.exports = function InMemoryStorer(keepData) {

  /** Map of items.
   * @type {String => Object}
   * @private
   * @fieldOf InMemoryStorer#
   */
  var items = {};

  /** Number of items.
   * @type {Number}
   * @private
   * @fieldOf InMemoryStorer#
   */
  var count = 0;

  return {

    /** Stores the specified object into a map.
     *
     * @param {String} id Unique id to identify this data. It is used as file
     *    name. Cannot be null or empty.
     * @param {Object} data Object that contains the data to store. Cannot be
     *    null.
     * @param {String} role Role of the specified data. Can be null.
     * @param {Function} callback Callback invoked when the data is already
     *    saved. Cannot be null.
     */
    store: function (id, data, role, callback) {
      if (keepData) {
        items[id] = data;
      }
      count += 1;
      callback();
    },

    /** No waiting required, it just invokes the callback.
     *
     * @param {Function} callback Invoked when there is no pending operations.
     *    Cannot be null.
     */
    wait: function (callback) {
      callback();
    },

    /** Returns the number of stored items.
     * @return {Number} a valid number, never null.
     */
    getNumberOfItems: function () {
      return count;
    },

    /** Returns the list of successful items.
     *
     * @return {Object[]} Returns a list of items data, never null.
     */
    getItems: function () {
      var id;
      var list = [];

      for (id in items) {
        list.push(items[id]);
      }

      return list;
    },

    /** Closes and clean up this storer.
     */
    close: function () {
      if (!keepData) {
        items = [];
      }
    }
  };
};
