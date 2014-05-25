module.exports = function BackgroundOperation() {

  /** Number of pending operations.
   * @type {Number}
   * @private
   * @fieldOf BackgroundOperation#
   */
  var operations = -1;

  return {

    /** Starts a new background operation.
     */
    start: function () {
      operations += 1;
    },

    /** Ends a pending background operation.
     */
    end: function () {
      operations -= 1;
    },

    /** Waits until there is no more pending background operations.
     *
     * @param {Function} callback Invoked when there is no pending operations.
     *    Cannot be null.
     */
    wait: function (callback) {
      var checkOperations = function () {
        if (operations === -1) {
          callback();
        } else {
          setTimeout(checkOperations, 500);
        }
      };
      setTimeout(checkOperations, 500);
    }
  };
};
