module.exports = function CommitteeImporter(options) {

  /** Class logger, using the default if no one is provided.
   * @type winston.Logger
   * @constant
   * @private
   */
  var LOG = options && options.logger || require("winston");

  /** Base class to inherit behaviour from.
   * @type {Function}
   * @private
   * @fieldOf CommitteeImporter#
   */
  var Importer = require("../Importer");

  /** Current importer instance.
   * @type {Importer}
   * @private
   * @fieldOf CommitteeImporter#
   */
  var importer = new Importer(options);

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

  /** Utility to extend objects.
   * @type {Function}
   * @private
   * @fieldOf CommitteeImporter#
   */
  var extend = require("extend");

  /** Imports committee members.
   * @param {Object} committee Committee to import members. Cannot be null.
   * @param {Function} callback Invoked to continue processing the next
   *    commitee.
   * @private
   * @methodOf CommitteeImporter#
   */
  var processMembers = function (committee, callback) {
    var url = committee.url + "integrantes.html";

    importer.initEnv(url, function (errors, $) {
      var membersEl;
      var memberEl;
      var member;
      var i;

      if (errors || !$) {
        return callback(errors);
      }

      membersEl = $("table tbody tr");
      committee.members = [];

      for (i = 0; i < membersEl.length; i++) {
        memberEl = membersEl.eq(i).children();

        // Removes useless hidden span from role cell.
        memberEl.eq(1).find("span").remove();

        committee.members.push({
          position: importer.errorIfEmpty(memberEl.eq(1).text()),
          name: importer.errorIfEmpty(memberEl.eq(2).text()),
          district: importer.errorIfEmpty(memberEl.eq(3).text()),
          block: importer.errorIfEmpty(memberEl.eq(4).text())
        });
      }
      callback();
    });
  };

  /** Tries to get additional information for a specific committee.
   * @param {Object} committee Committee to retrieve information. Cannot be
   *    null.
   * @param {Function} callback Invoked when the process finished. Cannot be
   *    null.
   * @private
   * @methodOf CommitteeImporter#
   */
  var processCommittee = function (committee, callback) {
    var url = committee.url;

    if (!VALID_URL.test(url)) {
      return callback(null);
    }
    // Relative url.
    if (url.indexOf("http") === -1) {
      url = "http://www.hcdn.gob.ar" + url;
    }

    if (url.substr(-1) !== "/") {
      url += "/";
    }

    importer.initEnv(url, function (errors, $) {
      var table;

      if (errors || !$) {
        return callback(errors);
      }

      LOG.info("Processing " + url);

      table = $(".info-principal p");

      extend(committee, {
        url: url,
        location: importer.trim(table.eq(1).text()),
        secretary: importer.trim(table.eq(4).text()),
        chief: importer.trim(table.eq(6).text()),
        meetings: importer.trim(table.eq(8).text()),
        phones: importer.trim(table.eq(10).text())
      });

      callback();
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
    importer.initEnv(url, function (errors, $) {
      var committeesEl = $("#listado > table > tbody a");

      if (committeesEl.length === 0) {
        return callback(new Error("Bad response."));
      }

      // Parses committees in groups of 4 elements.
      async.forEachLimit(committeesEl, 4, function (committeeEl, next) {
        var committee = {
          name: importer.errorIfEmpty($(committeeEl).text()),
          url: importer.trim($(committeeEl).attr("href")),
          type: type
        };

        processCommittee(committee, function () {
          processMembers(committee, function () {
            importer.store(committee.name, committee, next);
          });
        });
      }, function (err) {
        callback(err);
      });
    });
  };

  return extend(importer, {

    /** Executes an enqueued task. Each task fetches a single page of bills.
     *
     * @param {Object} task Task to execute. Cannot be null.
     * @param {String} task.name Task name. Cannot be null or empty.
     * @param {Object} data Task specific data. Can be null.
     */
    execute: function (task, callback) {
      processPage(task.data.url, task.data.type, callback);
    },

    /** Enqueues a new task. Tasks will be executed as soon as the pool has
     * space for new elements.
     * @return {Object} Returns the task to enqueue, never null.
     */
    enqueueTask: function () {
      var type;

      if (types.length === 0) {
        return null;
      }
      type = types.shift();

      return {
        name: "Import Committees [" + type + "]",
        data: {
          type: type,
          url: URL + type
        }
      };
    }
  });
};
