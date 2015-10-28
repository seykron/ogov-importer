/** Imports the list of legislatives.
 * @constructor
 */
module.exports = function PeopleImporter(context) {

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

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Utilities to sanitize and operate with inputs.
   * @type {Object}
   */
  var InputUtils = require("../InputUtils");

  /** Fetches all committees the specified person belongs to.
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
  var fetchCommittees = function (requestContext) {
    return new Promise((resolve, reject) => {
      context.load(requestContext.endpoint).then($ => {
        var committeesEl = $(requestContext.selector);
        var committees = [];
        var nameEl;
        var link;
        var i;

        if (committeesEl.length === 0) {
          // No committees.
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
            id: link && InputUtils.trim(link.substr(link.lastIndexOf("/"))
              .replace("/", "")),
            name: nameEl.errorIfEmpty(),
            position: committeesEl.eq(i).find("td").eq(1).trim()
          });
        }
        resolve(committees);
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
        role: "legislative",
        jurisdiction: "nacion"
      });
    }
    return people;
  };

  /** Proccesses the legislatives index page.
   *
   * @private
   * @methodOf PeopleImporter#
   */
  var extractLegislatives = function () {
    return new Promise((resolve, reject) => {
      debug("loading legislatives: %s", URL_LEG);

      context.load(URL_LEG).then($ => {
        var people = parseInvalidTable($("table tbody").find("td"));

        debug("importing %s legislatives", people.length);

        // Parses people in groups of 4 elements.
        async.forEachLimit(people, 4, function (person, next) {
          if (!person.user) {
            debug("Invalid data for legislative: %s", JSON.stringify(person));
            return next();
          }

          debug("Importing data for %s", person.name);

          fetchCommittees({
            endpoint: "http://www.hcdn.gov.ar/diputados/" + person.user +
              "/comisiones.html",
            offset: 0,
            selector: "table tbody tr"
          }).then(committees => {
            person.committees = committees;
            context.store(person.user, person).nodeify(next);
          }).catch(err => {
            debug("error importing legislative: %s", err);
            next();
          });
        }, err => {
          if (err)
            reject(err);
          else
            resolve();
        });
      }).catch(reject);
    });
  };

  /** Proccesses the senators index page.
   *
   * @param {Function} callback Invoked to finish the task. Cannot be null.
   * @private
   * @methodOf PeopleImporter#
   */
  var extractSenators = function (callback) {
    return new Promise((resolve, reject) => {
      debug("loading senators: %s", URL_SEN);

      context.load(URL_SEN).then($ => {
        var peopleEl = $("table tbody tr");
        var personEl;

        debug("importing %s senators", peopleEl.length);

        // Parses people in groups of 4 elements.
        async.forEachLimit(peopleEl, 4, function (item, next) {
          var personEl = $("> td", item);
          var dateRange;
          var contactInfo;
          var userId;
          var person;

          userId = personEl.eq(1).find("a").attr("href")
            .replace(/\/senadores\/senador\//, "").replace("/", "");

          if (!userId) {
            return next();
          }

          dateRange = personEl.eq(4).html().split("<br>");
          contactInfo = personEl.eq(5).html().split("<br>");

          person = {
            pictureUrl: InputUtils.trim(personEl.eq(0).find("img").attr("src")),
            name: personEl.eq(1).errorIfEmpty(),
            district: personEl.eq(2).errorIfEmpty(),
            start: InputUtils.convertDate(dateRange.shift()),
            end: InputUtils.convertDate(dateRange.shift()),
            party: personEl.eq(3).errorIfEmpty(),
            email: InputUtils.errorIfEmpty(InputUtils.clean(contactInfo.shift())),
            phone: InputUtils.errorIfEmpty(InputUtils.clean(contactInfo.shift())),
            extension: InputUtils.errorIfEmpty(InputUtils.clean(contactInfo.shift())),
            role: "senator"
          };
          person.user = person.email.substr(0, person.email.indexOf("@"));

          debug("Importing data for %s", person.name);

          fetchCommittees({
            endpoint: "http://www.senado.gob.ar/senadores/senador/" + userId,
            offset: 1,
            selector: "table tr"
          }).then(committees => {
            person.committees = committees;
            context.store(person.user, person).nodeify(next);
          });
        }, err => {
          if (err)
            reject(err);
          else
            resolve();
        });
      }).catch(reject);
    });
  };

  return {
    /** Runs this importer.
     * @return {Promise} a promise to notify when the import process finished,
     *    never null.
     */
    run () {
      return new Promise((resolve, reject) => {
        extractSenators()
          .then(() => extractLegislatives())
          .then(resolve)
          .catch(reject);
      });
    },

    changed (oldPeopleGroup, newPerson) {
      return false;
    }
  };
};
