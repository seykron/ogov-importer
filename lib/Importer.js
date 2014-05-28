/** Provides support to implement importers.
 *
 * It manages the task pool, initializes the environment to import data from a
 * url and stores imported data using configured storers.
 *
 * It also provides some useful methods to deal with raw data.
 *
 * @constructor
 */
module.exports = function Importer(options) {

  /** Importer instance.
   * @private
   * @fieldOf Importer#
   */
  var instance = this;

  /** Node's Path API.
   * @private
   * @fieldOf Importer#
   */
  var path = require("path");

  /** Class logger, using the default if no one is provided.
   * @type winston.Logger
   * @constant
   * @private
   */
  var LOG = options && options.logger || require("winston");

  /** Number of concurrently tasks scrapping pages at the same time.
   * @type Number
   * @constant
   * @private
   * @fieldOf Importer#
   */
  var POOL_SIZE = options && options.poolSize || 2;

  /** JavaScript support libraries for jsdom.
   * @constant
   * @private
   * @fieldOf Importer#
   */
  var JS_LIBS = [path.join(__dirname, "support", "jquery.js")];

  /** Simple HTTP client for node.
   * @type {Function}
   * @private
   * @fieldOf Importer#
   */
  var request = require("request");

  /** JSDom library to parse results.
   * @type Object
   * @private
   * @fieldOf Importer#
   */
  var jsdom = require("jsdom");

  /** Async flow contro library.
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

  /** Flag that indicates whether to stop the importer.
   * @type Boolean
   * @private
   * @fieldOf Importer#
   */
  var stop = false;

  /** List of storers to save imported bills.
   * @type {Object[]}
   * @private
   * @fieldOf Importer#
   */
  var storers = options.storers || [];

  return extend(instance, {

    /** Executes an enqueued task.
     *
     * @param {Object} task Task to execute. Cannot be null.
     * @param {String} task.name Task name. Cannot be null or empty.
     * @param {Object} data Task specific data. Can be null.
     */
    execute: function (task, callback) {
      throw new Error("Must be implemented by subclasses.");
    },

    /** Enqueues a new task. Tasks will be executed as soon as the pool has
     * space for new elements.
     * @return {Object} Returns the task to enqueue, never null.
     */
    enqueueTask: function () {
      throw new Error("Must be implemented by subclasses.");
    },

    /** Initializes the import environment for the specified url. It uses the
     * cache if possible.
     *
     * @param {String} url Url to fetch and load into the import environment.
     *    Cannot be null or empty.
     * @param {Function} callback Callback that receives results. It takes an
     *    error and the DOM Window instance as parameters. Cannot be null.
     */
    initEnv: function (url, callback) {
      var doFetch = function () {
        request(url, function (err, response, body) {
          if (!err && response.statusCode === 200) {
            options.queryCache.put(url, body);

            // TODO(seykron): most of time in the process is the DOM parsing. Find
            // a better implementation.
            jsdom.env(body, JS_LIBS, callback);
          } else {
            callback(err);
          }
        });
      };
      if (options.queryCache) {
        // Tries to get the url from the cache.
        options.queryCache.get(url, function (err, pageData) {
          if (err) {
            doFetch();
          } else {
            jsdom.env(pageData, JS_LIBS, callback);
          }
        });
      } else {
        doFetch();
      }
    },

    /** Starts the importer and notifies every time a task is processed.
     *
     * @param {Function} [progressCallback] Function invoked when a group of
     *    tasks are already processed.
     */
    start: function (progressCallback) {
      var queue = async.queue(function (task, callback) {
        if (stop) {
          LOG.info("Task '" + task.name + "' aborted.");
          return callback();
        }

        instance.execute(task, function (err) {
          if (err) {
            LOG.info("Task '" + task.name + "' in error: " + err);
          }
          if (!stop){
            stop = err ? true : false;
          }
          if (progressCallback) {
            progressCallback(err);
          }
          callback(err);
        });
      }, POOL_SIZE);

      queue.empty = function () {
        var i;
        var task;

        if (stop) {
          return;
        }

        progressCallback();

        LOG.info("Queue empty. Adding another " + POOL_SIZE +
          " pages to the queue.");
        for (i = 0; i < POOL_SIZE; i++) {
          task = instance.enqueueTask();

          if (task) {
            queue.push(task);
          }
        }
      };
      queue.empty();
    },

    /** Stops the import process after current pages are finished.
     */
    stop: function () {
      stop = true;
    },

    /** Stores the specified data using configured storers.
     * @param {String} id Item unique identifier. Cannot be null or empty.
     * @param {Object} data Data to store. Cannot be null.
     * @param {Function} callback Invoked when storers already saved the data.
     *    It takes an error as parameter. Cannot be null.
     */
    store: function (id, data, callback) {
      async.each(storers, function (storer, nextStorer) {
        storer.store(id, data, nextStorer);
      }, callback);
    },

    /** Strips non white characters from  a string.
     * @param {String} str String to strip non-white characters. Cannot be null.
     * @return {String} A string without non-white characters, never null.
     */
    stripNonWhiteChars: function (str) {
      return str.replace(/[\t\n]+/ig, "");
    },

    /** Removes spaces at the beginning and at the end of the specified String.
     * @param {String} string String to trim. Cannot be null.
     * @return {String} The trimmed String. Never returns null.
     */
    trim: function (string) {
      return instance.stripNonWhiteChars(string.replace(/^[\s\t\n]+/, "")
        .replace(/[\s\t\n]+$/, ""));
    },

    /** Converts a date string from format dd/MM/YYYY to Date.
     * @param {String} dateString Date in the expected format. Cannot be null or
     *   empty.
     * @return {Date} Returns the date object that represents the provided date.
     *   Never returns null.
     */
    convertDate: function (dateString) {
      var period = dateString.split("/");
      return new Date(period[1] + "/" + period[0] + "/" + period[2]);
    },

    /** Returns the element text or throws an error if it doesn't exist.
     * @param {Element} element Element to get text from. Cannot be null.
     * @param {String} [errorMessage] Error message thrown if the element text
     *   is null or empty. Can be null.
     * @return {String} Returns the required text.
     */
    errorIfEmpty: function (element, errorMessage) {
      if (!element || !element.textContent) {
        throw new Error(errorMessage || "Empty element found");
      }
      return instance.trim(element.textContent);
    },

    /** Returns the element text or a default String if it doesn't exist.
     * @param {Element} element Element to get text from. Cannot be null.
     * @param {String} [defaultText] Default String used if the element doesn't
     *   contain text. Can be null.
     * @return {String} Returns the required text, or empty if it cannot be
     *   resolved.
     */
    defaultIfEmpty: function (element, defaultText) {
      var content = defaultText || "";
      if (element && element.textContent) {
        content = element.textContent;
      }
      return instance.trim(content);
    }
  });
};
