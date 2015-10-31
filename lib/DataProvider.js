/** Simple data provider that keeps data in memory.
 *
 * WARNING: it is not optimized, it keeps an internal object cache in the heap
 * space and it won't be released until it is garbage-collected. Use it at your
 * own risk.
 */
module.exports = function DataProvider (key, fetch, map) {

  /** Default logger. */
  var debug = require("debug")("data_provider");

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Objects cache. */
  var cache = {};

  /** Merges the specified item with the existing one in the cache. If the cache
   * has not the same item, it returns the provided item.
   * @param {Object} item Item to merge. Cannot be null.
   */
  var merge = function (item) {
    return new Promise((resolve, reject) => {
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
        resolve(mergedItem);
      } else {
        debug("cannot merge %s", cacheKey);
        resolve(item);
      }
    });
  };

  return {
    /** Fetch items and put them into the memory cache.
     */
    load () {
      return new Promise((resolve, reject) => {
        debug("loading items into the cache");

        resolve(fetch().then(items => {
          var item;
          var resolvedItem;

          debug("caching %s items", items.length);

          items.forEach(item => {
            if (item) {
              resolvedItem = map(item);
              cache[resolvedItem[key]] = resolvedItem;
            }
          });

          debug("cache ready");

          resolve();
        }));
      });
    },

    /** Merges the specified item with the underlying item in the cache, if it
     * exists. It merges only non-null values.
     * @param {Object} item Item to merge. Cannot be null.
     * @return {Promise<Object|Error>} a promise to the merge item, never null.
     */
    merge (item) {
      return merge(item);
    }
  };
};
