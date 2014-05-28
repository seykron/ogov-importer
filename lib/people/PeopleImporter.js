/** Imports the list of legislatives.
 * @constructor
 */
module.exports = function PeopleImporter(options) {

  /** Class logger, using the default if no one is provided.
   * @type winston.Logger
   * @constant
   * @private
   */
  var LOG = options && options.logger || require("winston");

  /** Base class to inherit behaviour from.
   * @type {Function}
   * @private
   * @fieldOf PeopleImporter#
   */
  var Importer = require("../Importer")

  /** Current importer instance.
   * @type {Importer}
   * @private
   * @fieldOf PeopleImporter#
   */
  var importer = new Importer(options);

  /** Url of the committeees index.
   * @constant
   * @private
   * @fieldOf PeopleImporter#
   */
  var URL = "http://www.hcdn.gov.ar/diputados/listadip.html";

  /** Indicates whether the importer is already running or not.
   * @private
   * @fieldOf PeopleImporter#
   */
  var processing = false;

  /** Async flow control library.
   * @type Object
   * @private
   * @fieldOf PeopleImporter#
   */
  var async = require("async");

  /** Utility to extend objects.
   * @type {Function}
   * @private
   * @fieldOf PeopleImporter#
   */
  var extend = require("extend");

  /** Fetches all committees the specified person belongs to.
   * @param {Object} person Person that belong to the required committees.
   *    Cannot be null.
   * @param {Function} callback Invoked when the committees are resolved.
   *    Cannot be null.
   * @private
   * @methodOf PeopleImporter#
   */
  var fetchCommittees = function (person, callback) {
    var userUrl = "http://www.hcdn.gov.ar/diputados/" + person.user +
      "/comisiones.html";
    if (!person.user) {
      return callback();
    }
    importer.initEnv(userUrl, function (errors, window) {
      var committeesEl = window.jQuery("#tablaComisiones tbody tr");
      var i;

      person.committees = [];

      if (committeesEl.length === 0) {
        // No committees.
        callback();
      }

      for (i = 0; i < committeesEl.length; i++) {
        person.committees.push({
          name: importer.trim(window.jQuery(committeesEl.get(i))
            .find("td").get(0).textContent),
          position: importer.trim(window.jQuery(committeesEl.get(i))
            .find("td").get(1).innerHTML)
        });
      }
      importer.store(person.user, person, callback);
    });
  };

  /** The people table has a missing <tr> at the beginning of each row...... so
   * we need to fix it somehow before operate with DOM. Rows are infered from
   * position in the children collection.
   *
   * @param {Object} jQuery jQuery instance for the current page. Cannot be
   *    null.
   * @param {Element[]} cells List of <td>'s with people information. Cannot be
   *    null.
   * @return {Object[]} The list of people with basic information, never null.
   * @private
   * @methodOf PeopleImporter#
   */
  var parseInvalidTable = function (jQuery, cells) {
    var i;
    var people = [];
    var user;

    for (i = 0; i < cells.length; i += 6) {
      user = jQuery(cells[i + 1]).find("a").attr("href")
        .replace(/\/diputados\//, "")
        .replace("/", "");
      people.push({
        pictureUrl: importer.trim(jQuery(cells[i]).find("img").attr("src")),
        name: importer.trim(jQuery(cells[i + 1]).text()),
        user: user,
        email: user + "@diputados.gob.ar",
        district: importer.trim(jQuery(cells[i + 2]).text()),
        start: importer.trim(jQuery(cells[i + 3]).text()),
        end: importer.trim(jQuery(cells[i + 4]).text()),
        party: importer.trim(jQuery(cells[i + 5]).text())
      });
    }
    return people;
  };

  /** Proccesses the committee index page.
   *
   * @param {Function} callback Invoked to finish the task. Cannot be null.
   * @private
   * @methodOf PeopleImporter#
   */
  var processPage = function (callback) {
    importer.initEnv(URL, function (errors, window) {
      var peopleEl = window.jQuery("table tbody").find("td");
      var people;

      if (peopleEl.length === 0) {
        callback(new Error("Bad response."));
      }

      people = parseInvalidTable(window.jQuery, peopleEl);

      // Parses people in groups of 4 elements.
      async.forEachLimit(people, 4, function (person, next) {
        LOG.info("Importing data for " + person.name);

        fetchCommittees(person, next);
      }, callback);
    });
  };

  return extend(importer, {

    /** Executes an enqueued task. There's a single task to import people.
     *
     * @param {Object} task Task to execute. Cannot be null.
     * @param {String} task.name Task name. Cannot be null or empty.
     * @param {Object} data Task specific data. Can be null.
     */
    execute: function (task, callback) {
      processPage(callback);
    },

    /** Enqueues a new task. Tasks will be executed as soon as the pool has
     * space for new elements.
     * @return {Object} Returns the task to enqueue, never null.
     */
    enqueueTask: function () {
      if (processing) {
        return null;
      }
      processing = true;

      return {
        name: "Import People",
        data: {}
      };
    }
  });
};
