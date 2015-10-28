module.exports = (function InputUtils () {

  /** Regexp to extract a url from the javascript function to open popups.
   * Matches: javascript:OpenWindow("http://real-url-goes-here",400,400)
   * @type RegExp
   * @private
   */
  var EXTRACT_URL = /[\"\'](.*)[\"\']/;

  /** Node's FileSystem API.
   * @type {Object}
   * @private
   */
  var fs = require("fs");

  /** Node's crypto API.
   * @type {Object}
   * @private
   */
  var crypto = require("crypto");

  /** Utility to create temporary files.
   * @type {Object}
   */
  var tmp = require('tmp');

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  return {
    /** Checks whether the specified object is a valid DOM element.
     * @param {Object} element Object to check. Cannot be null.
     * @return {Boolean} true if the object is an element, false otherwise.
     */
    isElement (element) {
      return (element && (element.textContent !== undefined ||
        typeof element.text === "function"));
    },

    /** Returns the specified element as text.
     *
     * @param {Element|String} element Element to read text from, or the
     *    provided String. Cannot be null.
     * @param {Boolean} [html] Indicates whether the provided String is a HTML
     *    chunk and must be converted to text. Default is false.
     * @return {String} Returns the element's content as text, or null if text
     *    cannot be resolved.
     */
    text (element, html) {
      var content = null;
      var context;

      if (this.isElement(element)) {
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
    },

    /** Strips non white characters from  a string.
     * @param {String} str String to strip non-white characters. Cannot be null.
     * @return {String} A string without non-white characters, never null.
     */
    stripNonWhiteChars (str) {
      var content = this.text(str);

      if (content) {
        content = content.replace(/[\t\n]+(\s{2})+/ig, "");
      }
      return content;
    },

    /** Removes spaces at the beginning and at the end of the specified String.
     * @param {String} string String to trim. Cannot be null.
     * @return {String} The trimmed String. Never returns null.
     */
    trim (string) {
      var content = this.text(string);

      if (content) {
        content = this.stripNonWhiteChars(content.trim());
      }

      return content;
    },

    /** Removes HTML tags and non-whitespace characters from a String. It uses
     * a basic regexp to remove HTML tags, so it won't work in complex cases.
     * @param {String} string String to clean up. Cannot be null.
     * @return {String} the cleaned up string, never null.
     */
    clean (string) {
      return this.stripNonWhiteChars(string.replace(/<[^>]*>/ig, ""));
    },

    /** Converts a date string from format dd/MM/YYYY to Date.
     * @param {String} dateString Date in the expected format. Cannot be null or
     *   empty.
     * @return {Date} Returns the date object that represents the provided date.
     *   Never returns null.
     */
    convertDate (dateString) {
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
    errorIfEmpty (element, errorMessage) {
      var content = this.text(element);

      if (content === null) {
        throw new Error(errorMessage || "Empty element found");
      }
      return this.trim(content);
    },

    /** Returns the element text or a default String if it doesn't exist.
     * @param {Element} element Element to get text from. Cannot be null.
     * @param {String} [defaultText] Default String used if the element doesn't
     *   contain text. Can be null.
     * @return {String} Returns the required text, or empty if it cannot be
     *   resolved.
     */
    defaultIfEmpty (element, defaultText) {
      return this.trim(this.text(element) || defaultText);
    },

    /** Normalizes a bill id to keep consistence between different importers.
     *
     * @param {String} file File to normalize. Cannot be null or empty.
     * @return {String} Returns the normalized file, never null or empty.
     */
    normalizeFile (file) {
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
    },


    /** Creates a temporary file and writes the specified data.
     *
     * @param {String|Stream} content Data to write into the temp file. May be
     *    a String content or a read Stream. Cannot be null.
     * @return {Promise<String|Error>} Returns a promise to receive the
     *    temporary file path, nevern ull.
     */
    writeTempFile (content) {
      return new Promise((resolve, reject) => {
        tmp.file((err, path, fd) => {
          var fsStream;

          if (err) {
            return reject(err);
          }

          if (typeof content === "string" ||
            content instanceof String) {
            fs.writeFile(path, content, err => {
              if (err) {
                return reject(err);
              }
              resolve(path);
            });
          } else {
            fsStream = fs.createWriteStream(path);

            content.on("end", () => {
              // Maybe it is a node bug with file streams, we need to wait until
              // IO operations finish.
              // @see #12
              setImmediate(function () {
                fsStream.end();
                resolve(path);
              }, 100);
            });
            content.on("error", function (err) {
              reject(err);
            });
            content.pipe(fsStream);
          }
        });
      });
    },

    /** Generates a SHA-1 hash for the specified key.
     * @param {String} key Key to generate hash. Cannot be null or empty.
     * @return {String} The SHA hash as digest, never null.
     */
    generateId (key) {
      var sha = crypto.createHash('sha1');
      var keyId = JSON.stringify(key);
      var entryFile;

      sha.update(keyId);

      return sha.digest("hex");
    },

    /** Extracts the first matching url from the specified text.
     * @param {String} line Text to match. Cannot be null or empty.
     * @return {String} The required url, or null if it doesn't exist.
     */
    extractUrl (line) {
      var url = null;

      if (line && EXTRACT_URL.test(line)) {
        url = line.match(EXTRACT_URL).pop();
      }

      return url;
    },

    /** Converts a DOM collection to a native array.
     * @param {Cheerio} $ Cheerio environment root selector. Cannot be null.
     * @param {Cheerio} items DOM collection. Cannot be null.
     * @return {Element[]} An array of DOM elements, never null.
     */
    asList ($, items) {
      var i;
      var result = [];
      var item;

      for (i = 0; i < items.length; i++) {
        item = $(">", items.eq(i));

        if (item.find("span").length === 0) {
          result.push(item);
        }
      }
      return result;
    }
  };
}());
