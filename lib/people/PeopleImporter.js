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

  /** Url of the legislatives index.
   * @constant
   * @private
   * @fieldOf PeopleImporter#
   */
  var URL_LEG = "http://www.hcdn.gov.ar/diputados/listadip.html";

  /** Url of the senators index.
   * @constant
   * @private
   * @fieldOf PeopleImporter#
   */
  var URL_SEN = "http://www.senado.gob.ar/senadores/listados/listaSenadoRes";

  /** List of supported tasks.
   * @type {String[]}
   * @private
   * @fieldOf PeopleImporter#
   */
  var tasks = [URL_LEG, URL_SEN];

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

  /** Extracts the text from the specified html.
   * @param {String} html String with HTML content. Cannot be null or empty.
   * @return {String} The text content, never null.
   */
  var htmlToText = function (jQuery, html) {
    return jQuery("<span />").html(html).text();
  };

  /** Fetches all committees the specified person belongs to.
   * @param {Object} person Person that belong to the required committees.
   *    Cannot be null.
   * @param {Object} context Context information to fetch committees. Cannot
   *    be null.
   * @param {String} context.endpoint Endpoint to retrieve data for parsing.
   *    Cannot be null or empty.
   * @param {Number} offset Index of row to start the iteration. Cannot be null.
   * @param {String} selector CSS selector to retrieve the set of rows to parse.
   *    Cannot be null or empty.
   * @param {Function} callback Invoked when the committees are resolved.
   *    Cannot be null.
   * @private
   * @methodOf PeopleImporter#
   */
  var fetchCommittees = function (person, context, callback) {
    importer.initEnv(context.endpoint, function (errors, window) {
      var committeesEl;
      var nameEl;
      var link;
      var i;

      if (errors || !window) {
        return callback();
      }

      person.committees = [];
      committeesEl = window.jQuery(context.selector);

      if (committeesEl.length === 0) {
        // No committees.
        importer.store(person.user, person, callback);
        return;
      }
      for (i = context.offset; i < committeesEl.length; i++) {
        nameEl = window.jQuery(window.jQuery(committeesEl.get(i)).find("td")
          .get(0)).find("a");
        link = nameEl.attr("href");

        if (link && link.substr(-1) === "/") {
          link = link.substr(0, link.length - 2);
        }

        person.committees.push({
          id: link && importer.trim(link.substr(link.lastIndexOf("/"))
            .replace("/", "")),
          name: importer.trim(nameEl.text()),
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
        party: importer.trim(jQuery(cells[i + 5]).text()),
        role: "legislative"
      });
    }
    return people;
  };

  /** Proccesses the legislatives index page.
   *
   * @param {Function} callback Invoked to finish the task. Cannot be null.
   * @private
   * @methodOf PeopleImporter#
   */
  var extractLegislatives = function (callback) {
    importer.initEnv(URL_LEG, function (errors, window) {
      var peopleEl = window.jQuery("table tbody").find("td");
      var people;

      if (peopleEl.length === 0) {
        callback(new Error("Bad response."));
      }

      people = parseInvalidTable(window.jQuery, peopleEl);

      // Parses people in groups of 4 elements.
      async.forEachLimit(people, 4, function (person, next) {
        if (!person.user) {
          return next();
        }

        LOG.info("Importing data for " + person.name);

        fetchCommittees(person, {
          endpoint: "http://www.hcdn.gov.ar/diputados/" + person.user +
            "/comisiones.html",
          offset: 0,
          selector: "table tbody tr"
        }, next);
      }, callback);
    });
  };

  /** Proccesses the senators index page.
   *
   * @param {Function} callback Invoked to finish the task. Cannot be null.
   * @private
   * @methodOf PeopleImporter#
   */
  var extractSenators = function (url, callback) {
    importer.initEnv(URL_SEN, function (errors, window) {
      var peopleEl = window.jQuery("table tbody tr");
      var personEl;

      if (peopleEl.length === 0) {
        callback(new Error("Bad response."));
      }

      // Parses people in groups of 4 elements.
      async.forEachLimit(peopleEl, 4, function (item, next) {
        var personEl = window.jQuery(item).children();
        var dateRange;
        var contactInfo;
        var userId;
        var person;

        userId = window.jQuery(personEl.get(1)).find("a").attr("href")
          .replace(/\/senadores\/senador\//, "").replace("/", "");
        dateRange = window.jQuery(personEl.get(4)).html().split("<br>");
        contactInfo = window.jQuery(personEl.get(5)).html().split("<br>");

        person = {
          pictureUrl: importer.trim(window.jQuery(personEl.get(0)).find("img")
            .attr("src")),
          name: importer.trim(window.jQuery(personEl.get(1)).text()),
          district: importer.trim(window.jQuery(personEl.get(2)).text()),
          start: importer.trim(dateRange.shift()),
          end: importer.trim(dateRange.shift()),
          party: importer.trim(window.jQuery(personEl.get(3)).text()),
          email: importer.trim(htmlToText(window.jQuery, contactInfo.shift())),
          phone: importer.trim(htmlToText(window.jQuery, contactInfo.shift())),
          extension: importer.trim(htmlToText(window.jQuery,
            contactInfo.shift())),
          role: "senator"
        };
        person.user = person.email.substr(0, person.email.indexOf("@"));

        if (!userId) {
          return next();
        }

        LOG.info("Importing data for " + person.name);

        fetchCommittees(person, {
          endpoint: "http://www.senado.gob.ar/senadores/senador/" + userId,
          offset: 1,
          selector: "table tr"
        }, next);
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
      if (task.data.url === URL_LEG){
        extractLegislatives(callback);
      } else {
        extractSenators(callback);
      }
    },

    /** Enqueues a new task. Tasks will be executed as soon as the pool has
     * space for new elements.
     * @return {Object} Returns the task to enqueue, never null.
     */
    enqueueTask: function () {
      var task = null;
      if (tasks.length > 0) {
        task = {
          name: "Import People",
          data: {
            url: tasks.shift()
          }
        };
      }
      return task;
    }
  });
};
