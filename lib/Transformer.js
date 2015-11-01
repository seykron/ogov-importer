/** Transforms items comparing them with another items retrieved from data
 * providers.
 *
 * WARNING: it is not optimized, it keeps an internal object cache in the heap
 * space and it won't be released until it is garbage-collected. Use it at your
 * own risk.
 */
module.exports = function Transformer(dataProviders, key, map) {

  /** Default logger. */
  var debug = require("debug")("transformer");

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Control flow library. */
  var async = require("async");

  /** Objects cache. */
  var cache = {};

  /** Merges the specified item with the existing one in the cache. If the cache
   * has not the same item, it returns the provided item.
   * @param {Object} item Item to merge. Cannot be null.
   */
  var merge = function (item) {
    var cacheKey = item[key];
    var cacheItem = cache[cacheKey];
    var mergedItem = Object.assign({}, item);

    if (cache.hasOwnProperty(cacheKey)) {
      debug("merging %s", cacheKey);

      // Copies only non-null values.
      Object.keys(cacheItem).forEach(key => {
        if (cacheItem[key] || !item.hasOwnProperty(key)) {
          mergedItem[key] = cacheItem[key];
        }
      });
    } else {
      debug("cannot merge %s", cacheKey);
    }

    return mergedItem;
  };

  /** Puts a list of items into the cache.
   * @param {Object[]} items Items to put into the cache. Cannot be null.
   */
  var put = function (items) {
    items.forEach(item => {
      var cacheKey;

      if (item) {
        cacheKey = item[key];
        cache[cacheKey] = map(merge(item));
      }
    });
  };

  /** Initializes the cache with the items retrieve from data providers.
   */
  var initCache = function () {
    return new Promise((resolve, reject) => {
      debug("initializing cache");

      async.eachSeries(dataProviders, (dataProvider, next) => {
        dataProvider.list().then(items => {
          put(items);
          next();
        }).catch(err => next(err));
      }, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  return {
    /** Fetch items and put them into the memory cache.
     */
    load () {
      return initCache();
    },

    /** Merges the specified item with the underlying item in the cache, if it
     * exists. It merges only non-null values.
     * @param {Object} item Item to merge. Cannot be null.
     * @return {Promise<Object|Error>} a promise to the merge item, never null.
     */
    merge (item) {
      return new Promise((resolve, reject) => {
        resolve(merge(item));
      });
    },

    close () {
      dataProviders.forEach(dataProvider => dataProvider.close());
    }
  };
};
