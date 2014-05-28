/** Stores data in memory using a map.
 *
 * @constructor
 */
module.exports = function InMemoryStorer() {

  /** Map of items.
   * @type {String => Object}
   * @private
   * @fieldOf InMemoryStorer#
   */
  var items = {};

  return {

    /** Stores the specified object into a map.
     *
     * @param {String} id Unique id to identify this data. It is used as file
     *    name. Cannot be null or empty.
     * @param {Object} data Object that contains the data to store. Cannot be
     *    null.
     * @param {Function} callback Callback invoked when the data is already
     *    saved. Cannot be null.
     */
    store: function (id, data, callback) {
      items[id] = data;
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
    }
  };
};
