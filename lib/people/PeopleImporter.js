/** Imports the list of legislatives.
 * @constructor
 */
module.exports = function PeopleImporter(context) {

  /** Node's file system API. */
  var fs = require("fs");

  /** Node's path API. */
  var path = require("path");

  /** Control flow library. */
  var async = require("async");

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Loads importers defined for each jurisdiction.
   */
  var loadImporters = function () {
    var importersDir = path.normalize(__dirname + "/jurisdiction");
    var files = fs.readdirSync(importersDir);

    return files.map(file => {
      return require(path.join(importersDir, file));
    });
  };

  return {

    /** Runs this importer.
     * @return {Promise} a promise to notify when the import process finished,
     *    never null.
     */
    run () {
      return new Promise((resolve, reject) => {
        async.each(loadImporters(), (importer, next) => {
          importer(context).run().nodeify(next);
        }, err => {
          if (err)
            reject(err);
          else
            resolve();
        });
      });
    },

    changed (oldPeopleGroup, newPerson) {
      return false;
    }
  };
};
