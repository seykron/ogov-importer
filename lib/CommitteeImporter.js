module.exports = function CommitteeImporter() {

  /** Url of the committeees index.
   * @constant
   * @private
   * @fieldOf CommitteeImporter#
   */
  var URL = "http://www.hcdn.gob.ar/comisiones/index.html?mostrar=";

  /** Permanent committees.
   * @constant
   * @private
   * @fieldOf CommitteeImporter#
   */
  var TYPE_PERMANENT = "permanentes";

  /** Special committees.
   * @constant
   * @private
   * @fieldOf CommitteeImporter#
   */
  var TYPE_SPECIAL = "especiales";

  /** Matches a valid committee url.
   * @constant
   * @private
   * @fieldOf CommitteeImporter#
   */
  var VALID_URL = /\/comisiones\/(especiales|permanentes)?\//;

  /** Simple HTTP client for node.
   * @type {Function}
   * @private
   * @fieldOf CommitteeImporter#
   */
  var request = require("request");

  /** JSDom library to parse results.
   * @type Object
   * @private
   * @fieldOf CommitteeImporter#
   */
  var jsdom = require("jsdom");

  /** Async flow control library.
   * @type Object
   * @private
   * @fieldOf CommitteeImporter#
   */
  var async = require("async");

  /** Utility to extend objects.
   * @type {Function}
   * @private
   * @fieldOf CommitteeImporter#
   */
  var extend = require("extend");

  /** Strips non white characters from  a string.
   * @param {String} str String to strip non-white characters. Cannot be null.
   * @return {String} A string without non-white characters, never null.
   * @private
   * @methodOf CommitteeImporter#
   */
  var stripNonWhiteChars = function (str) {
    return str.replace(/[\t\n]+/ig, "");
  };

  /** Removes spaces at the beginning and at the end of the specified String.
   * @param {String} string String to trim. Cannot be null.
   * @return {String} The trimmed String. Never returns null.
   * @private
   * @methodOf CommitteeImporter#
   */
  var trim = function (string) {
    return stripNonWhiteChars(string.replace(/^[\s\t\n]+/, "")
      .replace(/[\s\t\n]+$/, ""));
  };

  /** Tries to get additional information for a specific committee.
   * @param {Object} committee Committee to retrieve information. Cannot be
   *    null.
   * @param {Function} callback Invoked when the process finished. Cannot be
   *    null.
   * @private
   * @methodOf CommitteeImporter#
   */
  var processCommittee = function (committee, callback) {
    var url = committee.url;

    if (!VALID_URL.test(url)) {
      return callback(null);
    }
    // Relative url.
    if (url.indexOf("http") === -1) {
      url = "http://www.hcdn.gob.ar" + url;
    }
    request(url, function (err, response, body) {
      if (err) {
        committee.error = err;
        return callback(null);
      }
      jsdom.env(body, ["./jquery.js"], function (errors, window) {
        var table = window.jQuery(".info-principal p");

        extend(committee, {
          location: trim(window.jQuery(table.get(1)).text()),
          secretary: trim(window.jQuery(table.get(4)).text()),
          chief: trim(window.jQuery(table.get(6)).text()),
          meetings: trim(window.jQuery(table.get(8)).text()),
          phones: trim(window.jQuery(table.get(10)).text())
        });

        callback();
      });
    });
  };

  /** Proccesses the committee index page.
   *
   * @param {String} body Index page body. Cannot be null or empty.
   * @param {String} type Committee type. Cannot be null or empty.
   * @param {Function} callback Invoked to provide resolved committees. It
   *    takes an error and a list of committees as parameters. Cannot be null.
   * @private
   * @methodOf CommitteeImporter#
   */
  var processPage = function (body, type, callback) {
    var committees = [];

    jsdom.env(body, ["./jquery.js"], function (errors, window) {
      var committeesEl = window.jQuery("#listado > table > tbody a");
      var i;

      if (committeesEl.length === 0) {
        callback(new Error("Bad response."));
      }

      // Parses committees in groups of 4 elements.
      async.forEachLimit(committeesEl, 4, function (committeeEl, next) {
        var committee = {
          name: trim(window.jQuery(committeeEl).text()),
          url: trim(window.jQuery(committeeEl).attr("href")),
          type: type
        };

        processCommittee(committee, function () {
          committees.push(committee);
          next();
        });
      }, function (err) {
        callback(err, committees);
      });
    });
  };

  return {
    /** Starts the committees import process.
     * @param {Function} callback Receives an error and the list of resolved
     *    committees as parameters. Cannot be null.
     */
    start: function (callback) {
      request(URL + TYPE_PERMANENT, function (err, response, body) {
        if (err) {
          return callback(err);
        }
        processPage(body, TYPE_PERMANENT, callback);
      });
      request(URL + TYPE_SPECIAL, function (err, response, body) {
        if (err) {
          return callback(err);
        }
        processPage(body, TYPE_SPECIAL, callback);
      });
    }
  };
};
