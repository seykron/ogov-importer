module.exports = function CommitteeImporter(context) {

  /** Default logger, never null. */
  var debug = require("debug")("committee_importer");

  /** Url of the committeees index.
   * @constant
   * @private
   * @fieldOf CommitteeImporter#
   */
  var URL = "http://www.hcdn.gob.ar/comisiones/index.html?mostrar=";

  /** Matches a valid committee url.
   * @constant
   * @private
   * @fieldOf CommitteeImporter#
   */
  var VALID_URL = /\/comisiones\/(especiales|permanentes)?\//;

  /** Committee types.
   * @constant
   * @private
   * @fieldOf CommitteeImporter#
   */
  var types = ["permanentes", "especiales"];

  /** Async flow control library.
   * @type Object
   * @private
   * @fieldOf CommitteeImporter#
   */
  var async = require("async");

  /** Imports committee members.
   * @param {Object} committee Committee to import members. Cannot be null.
   * @return {Promise<Object|Error>} a promise to the committee members.
   */
  var processMembers = function (committeeUrl) {
    return new Promise((resolve, reject) => {
      var url = committeeUrl + "integrantes.html";

      debug("processing members of %s", committeeUrl);

      context.load(url).then($ => {
        var membersEl = $("table tbody tr");
        var memberEl;
        var members = [];
        var i;

        for (i = 0; i < membersEl.length; i++) {
          memberEl = membersEl.eq(i).children();

          // Removes useless hidden span from role cell.
          memberEl.eq(1).find("span").remove();

          members.push({
            position: memberEl.eq(1).errorIfEmpty(),
            name: memberEl.eq(2).errorIfEmpty(),
            district: memberEl.eq(3).errorIfEmpty(),
            block: memberEl.eq(4).errorIfEmpty()
          });
        }

        resolve(members);
      }).catch(reject);
    });
  };

  /** Tries to get additional information for a specific committee.
   * @param {String} committeeUrl Url of the committee to retrieve information.
   *    Cannot be null.
   * @return {Promise<Object|Error>} a promise to a committee, never null.
   */
  var processCommittee = function (committeeUrl) {
    return new Promise((resolve, reject) => {
      context.load(committeeUrl).then($ => {
        var table = $(".info-principal p");

        debug("processing %s", committeeUrl);

        resolve({
          url: committeeUrl,
          location: table.eq(1).text().trim(),
          secretary: table.eq(4).text().trim(),
          chief: table.eq(6).text().trim(),
          meetings: table.eq(8).text().trim(),
          phones: table.eq(10).text().trim()
        });
      }).catch(reject);
    });
  };

  /** Proccesses the committee index page.
   *
   * @param {String} url Url of the committees index page. Cannot be null or
   *    empty.
   * @param {String} type Committee type. Cannot be null or empty.
   * @param {Function} callback Invoked to provide resolved committees. It
   *    takes an error and a list of committees as parameters. Cannot be null.
   * @private
   * @methodOf CommitteeImporter#
   */
  var processPage = function (url, type, callback) {
    return new Promise((resolve, reject) => {
      context.load(url).then($ => {
        var committeesEl = $("#listado > table > tbody a");

        if (committeesEl.length === 0) {
          return reject(new Error("Bad response."));
        }

        // Parses committees in groups of 4 elements.
        async.forEachLimit(committeesEl, 4, function (committeeEl, next) {
          var committeeUrl = $(committeeEl).attr("href").trim();
          var committee = {
            name: $(committeeEl).errorIfEmpty(),
            url: committeeUrl,
            type: type
          };

          if (!VALID_URL.test(committeeUrl)) {
            debug("invalid url: %s", committeeUrl);
            return next();
          }

          // Relative url.
          if (committeeUrl.indexOf("http") === -1) {
            committeeUrl = "http://www.hcdn.gob.ar" + committeeUrl;
          }

          if (committeeUrl.substr(-1) !== "/") {
            committeeUrl += "/";
          }

          processCommittee(committeeUrl).then(info => {
            Object.assign(committee, info);
            return processMembers(committeeUrl);
          }).then(members => {
            Object.assign(committee, {
              members: members
            });
            context.store(committee.name, committee).nodeify(next);
          }).catch(reject);
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
        processPage(URL + "permanentes", "permanentes")
          .then(() => processPage(URL + "especiales", "especiales"))
          .then(resolve)
          .catch(reject);
      });
    },

    compare (committee1, committee2) {
      return 0;
    },

    changed (oldCommitteeGroup, newCommittee) {
      return false;
    }
  };
};
