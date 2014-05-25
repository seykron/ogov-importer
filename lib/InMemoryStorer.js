/** Keeps a set of bills in memory.
 * It stores bills in a map and discriminates bills with errors.
 *
 * @constructor
 */
module.exports = function InMemoryStorer() {

  /** Map of bills.
   * @type {String => Object}
   * @private
   * @fieldOf InMemoryStorer#
   */
  var bills = {};

  /** Map of bills with errors.
   * @type {String => Object}
   * @private
   * @fieldOf InMemoryStorer#
   */
  var billsInError = {};

  return {
    /** Stores the specified bill into a map.
     *
     * @param {Object} billData Bill to store. Cannot be null.
     * @param {Function} callback Callback invoked when the bill is already
     *    saved. Cannot be null.
     */
    store: function (billData, callback) {
      if (billData.error) {
        billsInError[billData.bill.file] = billData;
      } else {
        bills[billData.bill.file] = billData;
      }
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

    /** Returns the list of successful bills.
     *
     * @return {Object[]} Returns a list of bills data, never null.
     */
    getBills: function () {
      var id;
      var list = [];

      for (id in bills) {
        list.push(bills[id]);
      }

      return list;
    },

    /** Returns the list of bills in error.
     *
     * @return {Object[]} Returns a list of bills data, never null.
     */
    getBillsInError: function () {
      var id;
      var list = [];

      for (id in billsInError) {
        list.push(billsInError[id]);
      }

      return list;
    }
  };
};
