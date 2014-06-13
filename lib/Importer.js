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

  /** Node's FileSystem API.
   * @type {Object}
   * @private
   * @fieldOf Importer#
   */
  var fs = require("fs");

  /** Node's crypto API.
   * @type Object
   * @private
   * @fieldOf Importer#
   */
  var crypto = require("crypto");

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

  /** Utility to create temporary files.
   * @type {Object}
   * @private
   * @fieldOf Importer#
   */
  var tmp = require('tmp');

  var jQuery = require("jquery");

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

  /** Creates the DOM environment for the specified html fragment.
   * @param {String} html Html to load into the DOM environment. Cannot be null
   *    or empty.
   * @param {Function} callback Receives an error and the window object as
   *    parameters. Cannot be null.
   * @private
   * @methodOf Importer#
   */
  var createEnv = function (html, callback) {
    // TODO(seykron): most of time in the process is the DOM parsing. Find
    // a better implementation.
    jsdom.env({
      html: html,
      done: function (error, window) {
        if (error) {
          console.log(error);
          callback(error, null);
        } else {
          window.jQuery = function (selector) {
            return jQuery(window).find(selector);
          };
          callback(null, window);
        }
      },
      // Disables JavaScript files fetching and execution which are enabled by
      // default.
      features: {
        FetchExternalResources: false,
        ProcessExternalResources: false
      }
    });
  };

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
            if (options.queryCache) {
              options.queryCache.put(url, body);
            }

            createEnv(body, callback);
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
            createEnv(pageData, callback);
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

        // Let GC do its job.
        process.nextTick(function () {
          instance.execute(task, function (err) {
            if (err) {
              LOG.info("Task '" + task.name + "' in error: " + err);
            }
            if (progressCallback) {
              progressCallback(err);
            }
            callback(err);
          });
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
        storer.store(id, data, options.role || "", nextStorer);
      }, callback);
    },

    /** Strips non white characters from  a string.
     * @param {String} str String to strip non-white characters. Cannot be null.
     * @return {String} A string without non-white characters, never null.
     */
    stripNonWhiteChars: function (str) {
      return str.replace(/[\t\n]+(\s{2})+/ig, "");
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
      if (!element || (typeof element !== "string" && !element.textContent)) {
        throw new Error(errorMessage || "Empty element found");
      }
      if (typeof element === "string") {
        return instance.trim(element);
      } else {
        return instance.trim(element.textContent);
      }
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
      if (element) {
        if (typeof element === "string") {
          content = element;
        } else if (element.textContent) {
          content = element.textContent;
        }
      }
      return instance.trim(content);
    },

    /** Creates a temporary file and writes the specified data.
     *
     * @param {String|Stream} content Data to write into the temp file. May be
     *    a String content or a read Stream. Cannot be null.
     * @param {Function} callback Invoked to provide the temporary file. It
     *    takes a file as parameter. Cannot be null.
     */
    writeTempFile: function (content, callback) {
      tmp.file(function (err, path, fd) {
        var fsStream;

        if (err) {
          throw err;
        }

        if (typeof content === "string" ||
          content instanceof String) {
          fs.writeFile(path, content, function (err) {
            if (err) {
              throw err;
            }
            callback(path);
          });
        } else {
          content.on("end", function () {
            // Maybe it is a node bug with file streams, we need to wait until
            // IO operations finish.
            setTimeout(function (){
              callback(path);
            }, 1);
          });
          content.pipe(fs.createWriteStream(path));
        }
      });
    },

    /** Generates a SHA-1 hash for the specified key.
     * @param {String} key Key to generate hash. Cannot be null or empty.
     * @return {String} The SHA hash as digest, never null.
     */
    generateId: function (key) {
      var sha = crypto.createHash('sha1');
      var keyId = JSON.stringify(key);
      var entryFile;

      sha.update(keyId);

      return sha.digest("hex");
    }
  });
};
