module.exports = function MySqlDataProvider (options) {

  /** Default logger. */
  var debug = require("debug")("mysql_data_provider");

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Default configuration. */
  var config = Object.assign({
    query: null,
    params: []
  }, options);

  /** Mysql driver. */
  var mysql = require("mysql");

  /** Creates the connection to the specified data source. */
  var connection = mysql.createConnection(config.dataSource);

  return {

    /** Performs the configured query against the database and returns the
     * items.
     * @return {Promise<Object[]|Error>} a promise to the items, never null.
     */
    list () {
      return new Promise((resolve, reject) => {
        debug("querying items: %s", config.query);

        connection.query(config.query, config.params || [], (err, rows) => {
          if (err)
            reject(err);
          else
            resolve(rows);
        });
      });
    },

    close () {
      connection.end();
    }
  };
};
