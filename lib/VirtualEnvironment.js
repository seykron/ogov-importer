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

  /** Cookie jar for this environment. */
  var cookieJar = request.jar();

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

  /** Builds the cache key for the specified request config.
   * @param {Object} requestConfig Request configuration which response will be
   *    saved into the cache. Cannot be null.
   * @return {String} a valid key, never null or empty.
   */
  var generateCacheKey = function (requestConfig) {
    var cacheKey = requestConfig.url;

    if (requestConfig.form) {
      cacheKey += "|" + JSON.stringify(requestConfig.form);
    }
    if (requestConfig.formData) {
      cacheKey += "|" + JSON.stringify(requestConfig.formData);
    }
    return cacheKey;
  };

  /** Performs encoding conversion if required.
   * @param {Buffer} data Data to convert. Cannot be null.
   * @return {Buffer} the encoded data, never null.
   */
  var resolveEncoding = function (data) {
    var encodedData = data;
    var conv;

    try {
      if (options.encoding && options.encoding !== "utf8" &&
          options.encoding !== "utf-8") {
        conv = new iconv.Iconv(options.encoding, "utf-8");
        encodedData = conv.convert(data);
      }
    } catch (cause) {
      // We fail quietly.
      debug("error trying to convert to encoding %s: %s", options.encoding,
        cause.stack);
    }

    return encodedData;
  };

  /** Performs a GET HTTP request to the specified url and retrieves the
   * response body.
   * @param {Object} requestConfig Request options. Cannot be null.
   * @return {Promise<String|Error>} a promise to the response body, never null.
   */
  var fetch = function (requestConfig) {
    return new Promise((resolve, reject) => {
      var url = requestConfig.url;
      var cacheKey = generateCacheKey(requestConfig);

      debug("fetching %s", JSON.stringify(requestConfig));
      debug("sending cookies: %s", cookieJar.getCookieString(url));

      request(Object.assign({
        url: url,
        encoding: null,
        jar: cookieJar,
        followAllRedirects: true,
        headers: {
          'User-Agent': 'request'
        }
      }, requestConfig), (err, response, body) => {
        if (!err && response.statusCode === 200) {
          debug("response ok from %s", url);

          if (config.queryCache) {
            debug("writing response to the cache for %s", url);
            config.queryCache.put(cacheKey, resolveEncoding(body));
          }

          resolve({
            body: resolveEncoding(body),
            response: response,
            cookies: cookieJar.getCookies(url)
          });
        } else {
          debug("response error from %s: %s", url, JSON.stringify(response));
          debug(response.statusCode);
          if (err)
            reject(err);
          else
            reject(new Error("Invalid response"))
        }
      });
    });
  };

  /** Initializes the import environment for the specified url. It uses the
   * cache if possible.
   *
   * @param {Object} requestConfig Request options. The response will be loaded
   *  into the import environment. Cannot be null.
   */
  var createEnv = function (requestConfig) {
    return new Promise((resolve, reject) => {
      var url = requestConfig.url;
      var cacheKey = generateCacheKey(requestConfig);

      if (config.queryCache && config.cacheEnabled) {
        debug("trying to hit cache for %s", url);

        // Tries to get the url from the cache.
        config.queryCache.get(cacheKey, (err, pageData) => {
          if (err) {
            debug("item not found in the cache: %s", url);
            resolve(fetch(requestConfig));
          } else {
            debug("item loaded from cache: %s", url);
            resolve({ body: pageData });
          }
        });
      } else {
        resolve(fetch(requestConfig));
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

    /** Creates the virtual DOM environment for the specified url or request
     * options. It returns a composite object with the raw response.
     *
     * @param {String|Object} urlOrRequestConfig Either URL or object specifying
     *   request options. Cannot be null.
     * @return {Promise<Cheerio|Error>} a promise to a cheerio object, never
     *    null.
     */
    loadWithResponse (urlOrRequestConfig) {
      return this.load(urlOrRequestConfig, true);
    },

    /** Creates the virtual DOM environment for the specified url or request
     * options.
     *
     * @param {String|Object} urlOrRequestConfig Either URL or object specifying
     *   request options. Cannot be null.
     * @param {Boolean} [withResponse] Indicates whether the result will be a
     *    composite object with the document and the raw HTTP response.
     * @return {Promise<Cheerio|Error>} a promise to a cheerio object, never
     *    null.
     */
    load (urlOrRequestConfig, withResponse) {
      return new Promise((resolve, reject) => {
        var requestConfig = urlOrRequestConfig;

        if (typeof urlOrRequestConfig === "string") {
          requestConfig = {
            url: urlOrRequestConfig
          };
        }

        debug("loading new environment: %s", requestConfig.url);

        createEnv(requestConfig).then((result) => {
          var body = result.body;
          var response = result.response;
          var root;

          debug("response received, creating environment: %s",
            requestConfig.url);
          root = cheerio.load(body);

          if (root) {
            if (withResponse)
              resolve(Object.assign({
                "$": initEnv(root),
              }, result));
            else
              resolve(initEnv(root));
          } else
            reject(new Error("Cannot load HTML: " + requestConfig.url));
        }).catch(reject);
      });
    }
  };
};
