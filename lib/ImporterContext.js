/** Provides support to implement importers.
 *
 * It manages the task pool, initializes the environment to import data from a
 * url and stores imported data using configured storers.
 *
 * It also provides some useful methods to deal with raw data.
 *
 * @constructor
 */
module.exports = function ImporterContext(storers, options) {

  /** Default class logger. */
  var debug = require("debug")("importer");

  /** Async flow control library.
   * @type Object
   * @private
   * @fieldOf Importer#
   */
  var async = require("async");

  /** Utility to extend objects.
   * @type {Function}
   * @private
   * @fieldOf Importer#
   */
  var extend = require("extend");

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Pool to process import tasks.
   * @type {Function}
   */
  var ImporterPool = require("./ImporterPool");

  /** Load HTML pages into a virtual browser.
   * @type {Function}
   */
  var VirtualEnvironment = require("./VirtualEnvironment");

  /** Node events handler.
   * @type {Function}
   */
  var EventEmitter = require("events").EventEmitter;

  /** Virtual DOM environment.
   */
  var env = new VirtualEnvironment(options);

  /** Pool to execute tasks. */
  var pool = new ImporterPool(options);

  (function __constructor() {
    // Closes storers when the process is terminated by pressing Ctrl+C. It
    // doesn't work on Windows yet.
    process.on('SIGINT', () => {
      storers.forEach(storer => storer.close());
      pool.save();
      process.exit();
    });
  }());

  return extend(new EventEmitter(), {

    pool: pool,

    load: env.load,

    /** Stores the specified data using configured storers.
     * @param {String} id Item unique identifier. Cannot be null or empty.
     * @param {Object} data Data to store. Cannot be null.
     * @return {Promise} a promise to continue after storing the item, never
     *    null.
     */
    store (id, data) {
      return new Promise((resolve, reject) => {
        async.each(storers, (storer, nextStorer) => {
          storer.store(id, data, options.role || "")
            .then(nextStorer)
            .catch(err => {
              debug("error storing item %s: %s", id, err);
              nextStorer(err);
            });
        }, err => {
          if (err)
            reject(err);
          else
            resolve();
        });
      });
    }
  });
};
