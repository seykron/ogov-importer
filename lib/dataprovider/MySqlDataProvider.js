module.exports = function MySqlDataProvider (key, options) {

  /** Default logger. */
  var debug = require("debug")("mysql_data_provider");

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Data importer utility. */
  var DataProvider = require("../DataProvider");

  /** Default configuration. */
  var config = Object.assign({
    query: null,
    params: [],
    map: item => item
  }, options);

  /** Mysql driver. */
  var mysql = require("mysql");

  /** Creates the connection to the specified data source. */
  var connection = mysql.createConnection(config.dataSource);

  /** Performs the configured query against the database and retrieves the
   * items to load into the cache.
   */
  var fetch = function () {
    return new Promise((resolve, reject) => {
      debug("querying items: %s", config.query);

      connection.query(config.query, config.params || [], (err, rows) => {
        if (err)
          reject(err);
        else
          resolve(rows);
      });
    });
  };

  var dataProvider = new DataProvider(key, fetch, config.map);

  return {
    load () {
      return dataProvider.load();
    },

    merge (item) {
      return dataProvider.merge(item);
    },

    close () {
      connection.end();
    }
  };
};
