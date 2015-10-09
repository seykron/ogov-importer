/** Imports the list of legislatives.
 * @constructor
 */
module.exports = function PeopleImporter(importer, options) {

  /** Default logger. */
  var debug = require("debug")("people_importer");

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

  /** Number of pending tasks.
   * @type {Number}
   * @private
   * @fieldOf PeopleImporter#
   */
  var pendingTasks = tasks.length;

  /** Fetches all committees the specified person belongs to.
   * @param {Object} person Person that belong to the required committees.
   *    Cannot be null.
   * @param {Object} requestContext Context information to fetch committees.
   *    Cannot be null.
   * @param {String} context.endpoint Endpoint to retrieve data for parsing.
   *    Cannot be null or empty.
   * @param {Number} offset Index of row to start the iteration. Cannot be null.
   * @param {String} selector CSS selector to retrieve the set of rows to parse.
   *    Cannot be null or empty.
   * @return {Promise<Object[]|Error>} a promise to the committees, never null.
   * @private
   */
  var fetchCommittees = function (person, requestContext) {
    return new Promise((resolve, reject) => {
      importer.load(requestContext.endpoint).then($ => {
        var committeesEl;
        var committees = [];
        var nameEl;
        var link;
        var i;

        person.committees = [];
        committeesEl = $(requestContext.selector);

        if (committeesEl.length === 0) {
          // No committees.
          importer.store(person.user, person)
            .then(resolve)
            .catch(reject);
          resolve([]);
          return;
        }
        for (i = requestContext.offset; i < committeesEl.length; i++) {
          nameEl = committeesEl.eq(i).find("td").eq(0).find("a");
          link = nameEl.attr("href");

          if (link && link.substr(-1) === "/") {
            link = link.substr(0, link.length - 2);
          }

          committees.push({
            id: link && importer.trim(link.substr(link.lastIndexOf("/"))
              .replace("/", "")),
            name: nameEl.errorIfEmpty(),
            position: committeesEl.eq(i).find("td").eq(1).trim()
          });
        }
        resolve(committees);
        importer.store(person.user, person)
          .then(resolve)
          .catch(reject);
      }).catch(reject);
    });
  };

  /** The people table has a missing <tr> at the beginning of each row...... so
   * we need to fix it somehow before operate with DOM. Rows are infered from
   * position in the children collection.
   *
   * @param {Element[]} cells List of <td>'s with people information. Cannot be
   *    null.
   * @return {Object[]} The list of people with basic information, never null.
   * @private
   * @methodOf PeopleImporter#
   */
  var parseInvalidTable = function (cells) {
    var i;
    var people = [];
    var user;

    for (i = 0; i < cells.length; i += 6) {
      user = cells.eq(i + 1).find("a").attr("href").replace(/\/diputados\//, "")
        .replace("/", "");

      people.push({
        pictureUrl: cells.eq(i).find("img").attr("src").trim(),
        name: cells.eq(i + 1).errorIfEmpty(),
        user: user,
        email: user + "@diputados.gob.ar",
        district: cells.eq(i + 2).errorIfEmpty(),
        start: cells.eq(i + 3).toDate(),
        end: cells.eq(i + 4).toDate(),
        party: cells.eq(i + 5).errorIfEmpty(),
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
  var extractLegislatives = function () {
    return new Promise((resolve, reject) => {
      importer.load(URL_LEG).then($ => {
        var people = parseInvalidTable($("table tbody").find("td"));

        // Parses people in groups of 4 elements.
        async.forEachLimit(people, 4, function (person, next) {
          if (!person.user) {
            debug("Invalid data for legislative: %s", JSON.stringify(person));
            return next();
          }

          debug("Importing data for %s", person.name);

          fetchCommittees(person, {
            endpoint: "http://www.hcdn.gov.ar/diputados/" + person.user +
              "/comisiones.html",
            offset: 0,
            selector: "table tbody tr"
          }).then(committees => {
            person.committees = committees;

            importer.store(person.user, person)
              .then(resolve)
              .catch(reject);
          }).catch(err => next(err));
        }, callback);
      });
    });
  };

  /** Proccesses the senators index page.
   *
   * @param {Function} callback Invoked to finish the task. Cannot be null.
   * @private
   * @methodOf PeopleImporter#
   */
  var extractSenators = function (callback) {
    importer.initEnv(URL_SEN, function (errors, $) {
      var peopleEl = $("table tbody tr");
      var personEl;

      if (peopleEl.length === 0) {
        callback(new Error("Bad response."));
      }

      // Parses people in groups of 4 elements.
      async.forEachLimit(peopleEl, 4, function (item, next) {
        var personEl = $("> td", item);
        var dateRange;
        var contactInfo;
        var userId;
        var person;

        userId = personEl.eq(1).find("a").attr("href")
          .replace(/\/senadores\/senador\//, "").replace("/", "");
        dateRange = personEl.eq(4).html().split("<br>");
        contactInfo = personEl.eq(5).html().split("<br>");

        person = {
          pictureUrl: importer.trim(personEl.eq(0).find("img").attr("src")),
          name: importer.errorIfEmpty(personEl.eq(1)),
          district: importer.errorIfEmpty(personEl.eq(2)),
          start: importer.convertDate(dateRange.shift()),
          end: importer.convertDate(dateRange.shift()),
          party: importer.errorIfEmpty(personEl.eq(3)),
          email: importer.errorIfEmpty(importer.text(contactInfo.shift(), true)),
          phone: importer.trim(importer.text(contactInfo.shift(), true)),
          extension: importer.trim(importer.text(contactInfo.shift(), true)),
          role: "senator"
        };
        person.user = person.email.substr(0, person.email.indexOf("@"));

        if (!userId) {
          return next();
        }

        debug("Importing data for %s", person.name);

        fetchCommittees(person, {
          endpoint: "http://www.senado.gob.ar/senadores/senador/" + userId,
          offset: 1,
          selector: "table tr"
        }, next);
      }, callback);
    });
  };

  return {

    run () {
      extractLegislatives().then(extractSenators())
        .then(() => context.emit("finish", config.name))
        .catch(err => context.emit("error", err))
    }
  };
};
