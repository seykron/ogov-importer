/** Imports events and labours from committees.
 *
 * @constructor
 */
module.exports = function EventsImporter(options) {

  /** Class logger, using the default if no one is provided.
   * @type winston.Logger
   * @constant
   * @private
   */
  var LOG = options && options.logger || require("winston");

  /** Base class to inherit behaviour from.
   * @type {Function}
   * @private
   * @fieldOf EventsImporter#
   */
  var Importer = require("../Importer");

  /** Current importer instance.
   * @type {Importer}
   * @private
   * @fieldOf EventsImporter#
   */
  var importer = new Importer(options);

  /** Url of the committeees agenda index.
   * @constant
   * @private
   * @fieldOf EventsImporter#
   */
  var AGENDA_URL = "http://www.diputados.gob.ar/comisiones/agenda/" +
    "agenda_ver_todo.html";

  /** Url of the committeees labour index.
   * @constant
   * @private
   * @fieldOf EventsImporter#
   */
  var LABOUR_URL = "http://www.diputados.gob.ar/comisiones/buscador/" +
    "buscador.html";

  /** Url to retrieve information about a labour event.
   * @constant
   * @private
   * @fieldOf EventsImporter#
   */
  var INFO_URL = "http://www.diputados.gob.ar/comisiones/buscador/result.html" +
    "?tipo_de_proy=" +
    "&proy_expdipN=" +
    "&proy_expdipT=" +
    "&proy_expdipA=" +
    "&itemParte=" +
    "&firmante=" +
    "&selComision=" +
    "&palabras=" +
    "&selSearchOptions=and" +
    "&txtOdNum=" +
    "&txtODAnio=" +
    "&ordenar=2" +
    "&button3=BUSCAR" +
    "&fecha=";

  /** Regular expression to extract event date.
   *
   * @type RegExp
   * @constant
   * @private
   * @fieldOf EventsImporter#
   */
  var EVENT_DATE_EXPR = /\w+\s(\d{2}\/\d{2}\/\d{2,4})/;

  /** Regular expression to match referenced bills.
   *
   * @type {RegExp}
   * @private
   * @fieldOf EventsImporter#
   */
  var FILE_EXPR = /(\d+-\w+-\d+)/;

  /** Async flow control library.
   * @type Object
   * @private
   * @fieldOf EventsImporter#
   */
  var async = require("async");

  /** Utility to extend objects.
   * @type {Function}
   * @private
   * @fieldOf EventsImporter#
   */
  var extend = require("extend");

  /** Indicates whether the process is running or not.
   * @type {Boolean}
   * @private
   * @fieldOf EventsImporter#
   */
  var busy = false;

  /** List of events in the agenda.
   * @type {Object[]}
   * @private
   * @fieldOf EventsImporter#
   */
  var events = [];

  /** Searches and return the event related to the specified committees in a
   * given date.
   *
   * @param {Date} date Required event date. Cannot be null.
   * @param {String[]} committees List of committees involved in the event.
   *    Cannot be null.
   * @private
   * @methodOf EventsImporter#
   */
  var findEvent = function (date, committees) {
    var event = events.filter(function (event) {
      var containsAll = committees.filter(function (committee) {
        return event.committees.indexOf(committee) > -1;
      });
      return event.date.getTime() === date.getTime() && containsAll;
    });
    return (event.length && event.shift()) || null;
  };

  /** Returns the list of committees that exist in the specified text.
   * @param {String} text Text to extract committees. Cannot be null.
   * @private
   * @methodOf EventsImporter#
   */
  var extractCommittees = function (text) {
    var cleanText = importer.trim(text);
    var start = cleanText.indexOf(":");

    if (start > -1) {
      cleanText = cleanText.substr(start + 1);
    }
    return cleanText.replace(/\n/ig, "").split(/[,;]/)
      .map(function (committee) {
        return importer.trim(committee);
      });
  };

  /** Extracts a the list of bill files from the specified text.
   * @param {String} line Text to extract files from. Cannot be null.
   * @return {String[]} Returns a list of bills in the text, never null.
   * @private
   * @methodOf EventsImporter#
   */
  var extractFiles = function (line) {
    var files = [];

    if (FILE_EXPR.test(line)) {
      line.split(FILE_EXPR).forEach(function (reference) {
        var file;

        if (FILE_EXPR.test(reference)) {
          file = importer.normalizeFile(reference);
          files.push(file);
        }
      });
    }

    return files;
  };

  /** Imports committee members.
   * @param {Object} committee Committee to import members. Cannot be null.
   * @param {Function} callback Invoked to continue processing the next
   *    committee.
   * @private
   * @methodOf EventsImporter#
   */
  var processLabourPage = function (date, callback) {
    importer.initEnv({
      uri: INFO_URL + date,
      method: "POST"
    }, function (errors, $) {
      var items = $("#columna2 > div");
      var currentLabour;
      var currentAction;
      var currentItem;
      var labours = [];
      var fileId = date.replace(/\//ig, "-").split("-").reverse().join("-");
      var item;
      var committees;
      var i;

      if (items.length === 0) {
        return callback(new Error("Bad response."));
      }

      LOG.info("Processing data for period: " + date);

      for (i = 0; i < items.length; i++) {
        item = $(items.get(i));

        // Beginning of a new committee.
        if (item.hasClass("comisiones-result")) {
          if (currentAction) {
            if (currentItem) {
              currentAction.items.push(currentItem);
            }
            currentLabour.actions.push(currentAction);
          }
          if (currentLabour) {
            labours.push(currentLabour);
          }
          currentAction = null;
          currentItem = null;
          committees = extractCommittees(item.text());
          currentLabour = {
            date: importer.convertDate(date),
            event: findEvent(importer.convertDate(date), committees),
            committees: committees,
            actions: []
          };
        }
        // Beginning of a new committee action.
        if (item.hasClass("tituloItem")) {
          if (currentAction) {
            currentLabour.actions.push(currentAction);
          }
          currentAction = {
            id: importer.errorIfEmpty(/^\d/.exec(item.text()).pop()),
            name: importer.errorIfEmpty(/-\s(.+)\:/.exec(item.text()).pop()),
            items: []
          };
        }
        // Action description.
        if (item.hasClass("parrafo-result")) {
          if (currentItem) {
            currentAction.items.push(currentItem);
          }
          currentItem = {
            summary: importer.errorIfEmpty(item.text()),
            files: extractFiles(item.text()) 
          };
        }
        // Action results.
        if (item.hasClass("resultado-result")) {
          if (currentItem) {
            currentItem.result = importer.defaultIfEmpty(item.text(), "None");
          } else {
            currentAction.result = importer.defaultIfEmpty(item.text(), "None");
          }
        }
      }

      importer.store(fileId, labours, callback);
    });
  };

  /** Tries to get additional information for a specific committee.
   * @param {Function} callback Invoked when the process finished. Cannot be
   *    null.
   * @private
   * @methodOf EventsImporter#
   */
  var processLabourInfo = function (callback) {
    importer.initEnv(LABOUR_URL, function (errors, $) {
      var eventDatesEl = $("select#fecha_inicio > option");

      if (eventDatesEl.length === 0) {
        return callback(new Error("Bad response."));
      }

      // Parses committees in groups of 4 elements.
      async.forEachLimit(eventDatesEl, 4, function (eventDateEl, next) {
        var date = importer.trim($(eventDateEl).val());

        if (date) {
          processLabourPage(date, next);
        } else {
          next();
        }
      }, function (err) {
        callback(err);
      });
    });
  };

  /** Processes the agenda index page.
   *
   * @param {Function} callback Invoked to provide resolved committees. It
   *    takes an error and a list of committees as parameters. Cannot be null.
   * @private
   * @methodOf EventsImporter#
   */
  var processEventsPage = function (callback) {
    importer.initEnv(AGENDA_URL, function (errors, $) {
      var eventHeadersEl = $("#tablaPpal > table > thead");

      if (eventHeadersEl.length === 0) {
        return callback(new Error("Bad response."));
      }

      eventHeadersEl.each(function (index, eventHeaderEl) {
        var eventsEl = $(eventHeaderEl).nextUntil("thead");
        var date = EVENT_DATE_EXPR.exec($(eventHeaderEl).text()).pop();

        eventsEl.each(function (index, eventEl) {
          var row = $(eventEl).find("td");
          var event;
          var hour;

          if (row.length === 2) {
            hour = $(row.get(0)).find("b").text();
            event = {
              date: importer.convertDate(date),
              hour: hour,
              location: importer.trim($(row.get(0)).contents().last().text()
                .replace(/\n/ig, "")),
              committees: extractCommittees($(row.get(1)).find("a").text()),
              topic: importer.trim($(row.get(1)).find("i").text()),
              summary: importer.trim($(row.get(1)).contents().last().text()
                .replace(/\n/ig, ""))
            };
            events.push(event);
          }
        });
      });

      processLabourInfo(callback);
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
      processEventsPage(callback);
    },

    /** Enqueues a new task. Tasks will be executed as soon as the pool has
     * space for new elements.
     * @return {Object} Returns the task to enqueue, never null.
     */
    enqueueTask: function () {
      if (busy) {
        return null;
      }
      busy = true;

      return {
        name: "Import Events and Labour"
      };
    }
  });
};
