/** Loads a site into a virtual browser environment.
 */
module.exports = function VirtualEnvironment(options) {

  /** Default configuration. */
  var config = Object.assign({
  }, options);

  /** Default logger. */
  var debug = require("debug")("virtual_environment");

  /** Simple HTTP client for node.
   * @type {Function}
   * @private
   */
  var request = require("request");

  /** Lightweight DOM library to parse results.
   * @type Object
   * @private
   */
  var cheerio = require("cheerio");

  /** Encoding converter. */
  var iconv = require("iconv");

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Utilities to sanitize and operate with inputs.
   * @type {Object}
   */
  var InputUtils = require("./InputUtils");

  /** Performs encoding conversion if required.
   * @param {Buffer} data Data to convert. Cannot be null.
   * @return {Buffer} the encoded data, never null.
   */
  var resolveEncoding = function (data) {
    var encodedData = data;
    var conv;

    if (options.encoding) {
      conv = new iconv.Iconv(options.encoding, "utf-8");
      encodedData = conv.convert(data);
    }

    return encodedData;
  };

  /** Performs a GET HTTP request to the specified url and retrieves the
   * response body.
   * @param {String} url Url to fetch. Cannot be null or empty.
   * @return {Promise<String|Error>} a promise to the response body, never null.
   */
  var fetch = function (url) {
    return new Promise((resolve, reject) => {
      debug("fetching %s", url);

      request({
        url: url,
        encoding: null,
        headers: {
          'User-Agent': 'request'
        }
      }, (err, response, body) => {
        if (!err && response.statusCode === 200) {
          debug("response ok from %s", url);

          if (config.queryCache) {
            debug("writing response to the cache for %s", url);
            config.queryCache.put(url, resolveEncoding(body));
          }

          resolve(resolveEncoding(body));
        } else {
          debug("response error from %s: %s", url, JSON.stringify(response));
          reject(err || response);
        }
      });
    });
  };

  /** Initializes the import environment for the specified url. It uses the
   * cache if possible.
   *
   * @param {String} url Url to fetch and load into the import environment.
   *    Cannot be null or empty.
   * @param {Function} callback Callback that receives results. It takes an
   *    error and the DOM Window instance as parameters. Cannot be null.
   */
  var createEnv = function (url) {
    return new Promise((resolve, reject) => {
      if (config.queryCache) {
        debug("trying to hit cache for %s", url);

        // Tries to get the url from the cache.
        config.queryCache.get(url, (err, pageData) => {
          if (err) {
            debug("item not found in the cache: %s", url);
            resolve(fetch(url));
          } else {
            debug("item loaded from cache: %s", url);
            resolve(pageData);
          }
        });
      } else {
        resolve(fetch(url));
      }
    });
  };

  /** Initializes the specified virtual DOM environment.
   * @param {Cheerio} $ cheerio environment to initialize. Cannot be null.
   * @return {Cheerio} The extended cheerio object, never null.
   */
  var initEnv = function ($) {
    Object.assign($.prototype, {
      trim () {
        return InputUtils.trim(this.text());
      },
      defaultIfEmpty (defaultText) {
        return InputUtils.defaultIfEmpty(this.text(), defaultText);
      },
      errorIfEmpty () {
        return InputUtils.errorIfEmpty(this.text());
      },
      toDate () {
        return InputUtils.convertDate(InputUtils.defaultIfEmpty(this.text()));
      },
      extractUrl (attributeName) {
        return InputUtils.extractUrl(this.attr(attributeName || "href"));
      },
      asList () {
        return InputUtils.asList($, this);
      }
    });
    return $;
  };

  return {

    /** Creates the virtual DOM environment for the specified url.
     * @param {String} url Url to fetch and load. Cannot be null or empty.
     * @return {Promise<Cheerio|Error>} a promise to a cheerio object, never
     *    null.
     */
    load: function (url) {
      return new Promise((resolve, reject) => {
        debug("loading new environment from %s", url);

        createEnv(url).then((html) => {
          var root;
          debug("response received, creating environment for %s", url);
          root = cheerio.load(html);

          if (root)
            resolve(initEnv(root));
          else
            reject(new Error("Cannot load HTML for: " + url));
        }).catch(reject);
      });
    }
  };
};
