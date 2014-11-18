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

  /** Lightweight DOM library to parse results.
   * @type Object
   * @private
   * @fieldOf Importer#
   */
  var cheerio = require("cheerio");

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

  /** Checks whether the specified object is a valid DOM element.
   * @param {Object} element Object to check. Cannot be null.
   * @return {Boolean} true if the object is an element, false otherwise.
   * @private
   * @methodOf Importer#
   */
  var isElement = function (element) {
    return (element && (element.textContent !== undefined ||
      typeof element.text === "function"));
  };

  /** Returns the specified element as text.
   *
   * @param {Element | String} element Element to read text from, or the
   *    provided String. Cannot be null.
   * @param {Boolean} [html] Indicates whether the provided String is a HTML
   *    chunk and must be converted to text. Default is false.
   * @return {String} Returns the element's content as text, or null if text
   *    cannot be resolved.
   * @private
   * @methodOf Importer#
   */
  var text = function (element, html) {
    var content = null;
    var context;

    if (isElement(element)) {
      if (typeof element.text === "function") {
        content = element.text();
      } else {
        content = element.textContent;
      }
    } else if (typeof element === "string") {
      if (html) {
        context = cheerio.load(element);
        content = context("*").text();
      } else {
        content = element;
      }
    }

    return content;
  };

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
    process.nextTick(function () {
      var $ = cheerio.load(html);
      callback(null, $);
    });
  };

  (function __constructor() {
    // Closes storers when the process is terminated by pressing Ctrl+C. It
    // doesn't work on Windows yet.
    process.on('SIGINT', function() {
      storers.forEach(function (storer) {
        storer.close();
      });
      process.exit();
    });
  }());

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
          instance.execute(task, function (err, exit) {
            if (err) {
              LOG.info("Task '" + task.name + "' in error: " + err);
            }
            if (progressCallback) {
              progressCallback(err);
            }
            if (exit) {
              stop = true;
            }
            try {
              callback(err);
            } catch (e) {
              LOG.error("Error processing task [" + task.id + "]: " + e);
            }
          });
        });
      }, POOL_SIZE);

      queue.empty = function () {
        var i;
        var task;

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
      queue.drain = function () {
        if (stop) {
          storers.forEach(function (storer) {
            storer.close();
          });
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
      var content = text(str);

      if (content) {
        content = content.replace(/[\t\n]+(\s{2})+/ig, "");
      }
      return content;
    },

    /** Removes spaces at the beginning and at the end of the specified String.
     * @param {String} string String to trim. Cannot be null.
     * @return {String} The trimmed String. Never returns null.
     */
    trim: function (string) {
      var content = text(string);

      if (content) {
        content = instance.stripNonWhiteChars(content.replace(/^[\s\t\n]+/, "")
          .replace(/[\s\t\n]+$/, ""));
      }

      return content;
    },

    /** Converts a date string from format dd/MM/YYYY to Date.
     * @param {String} dateString Date in the expected format. Cannot be null or
     *   empty.
     * @return {Date} Returns the date object that represents the provided date.
     *   Never returns null.
     */
    convertDate: function (dateString) {
      var result = null;
      var period;

      if (dateString) {
        period = dateString.split("/");

        result = new Date(period[1] + "/" + period[0] + "/" + period[2]);
      }
      return result;
    },

    /** Returns the element text or throws an error if it doesn't exist.
     * @param {Element} element Element to get text from. Cannot be null.
     * @param {String} [errorMessage] Error message thrown if the element text
     *   is null or empty. Can be null.
     * @return {String} Returns the required text.
     */
    errorIfEmpty: function (element, errorMessage) {
      var content = text(element);

      if (content === null) {
        throw new Error(errorMessage || "Empty element found");
      }
      return instance.trim(content);
    },

    /** Returns the element text or a default String if it doesn't exist.
     * @param {Element} element Element to get text from. Cannot be null.
     * @param {String} [defaultText] Default String used if the element doesn't
     *   contain text. Can be null.
     * @return {String} Returns the required text, or empty if it cannot be
     *   resolved.
     */
    defaultIfEmpty: function (element, defaultText) {
      return instance.trim(text(element) || defaultText);
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
          return callback(err);
        }

        if (typeof content === "string" ||
          content instanceof String) {
          fs.writeFile(path, content, function (err) {
            if (err) {
              return callback(err);
            }
            callback(path);
          });
        } else {
          fsStream = fs.createWriteStream(path);

          content.on("end", function () {
            // Maybe it is a node bug with file streams, we need to wait until
            // IO operations finish.
            // @see #12
            setTimeout(function () {
              fsStream.end();
              callback(null, path);
            }, 100);
          });
          content.on("error", function (err) {
            callback(err);
          });
          content.pipe(fsStream);
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
    },

    /** Returns the specified element as text.
     *
     * @param {Element | String} element Element to read text from, or the
     *    provided String. Cannot be null.
     * @param {Boolean} [html] Indicates whether the provided String is a HTML
     *    chunk and must be converted to text. Default is false.
     * @return {String} Returns the element's content as text, or null if text
     *    cannot be resolved.
     */
    text: function (element, html) {
      return text(element, html);
    },

    /** Converts the specified HTML chunk into a valid cheerio object.
     * @param {String} html Html to process. Cannot be null or empty.
     * @return {Cheerio} A valid cheerio object, never null.
     */
    loadHtml: function (html) {
      return cheerio.load(html);
    },

    /** Normalizes a bill id to keep consistence between different importers.
     *
     * @param {String} file File to normalize. Cannot be null or empty.
     * @return {String} Returns the normalized file, never null or empty.
     */
    normalizeFile: function (file) {
      var chunk = file.split("-");
      var year;

      if (chunk[0]) {
        chunk[0] = new Array(5 - chunk[0].length).join("0") + chunk[0];
      }
      if (chunk[2] && chunk[2].length < 4) {
        year = parseInt(chunk[2], 10);
        if (year > 90) {
          chunk[2] = "19" + chunk[2];
        } else {
          chunk[2] = "2" + new Array(4 - chunk[2].length).join("0") + chunk[2];
        }
      }

      return chunk.join("-");
    }
  });
};
