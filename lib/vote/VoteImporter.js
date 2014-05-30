/** Imports votes from PDF documents available for each Congress session since
 * year 2001.
 * @constructor
 */
module.exports = function VoteImporter(options) {

  /** Class logger, using the default if no one is provided.
   * @type winston.Logger
   * @constant
   * @private
   */
  var LOG = options && options.logger || require("winston");

  /** Base class to inherit behaviour from.
   * @type {Function}
   * @private
   * @fieldOf VoteImporter#
   */
  var Importer = require("../Importer")

  /** Current importer instance.
   * @type {Importer}
   * @private
   * @fieldOf VoteImporter#
   */
  var importer = new Importer(options);

  /** Url of the sessions index documents by period.
   * @constant
   * @private
   * @fieldOf VoteImporter#
   */
  var URL = "http://www.hcdn.gob.ar/secadmin/ds_electronicos/periodo/{0}/" +
      "index.html";

  /** Period since digital files are available.
   * @constant
   * @private
   * @fieldOf VoteImporter#
   */
  var BASE_PERIOD = 2001;

  /** Last processed period.
   * @type {Number}
   * @private
   * @fieldOf VoteImporter#
   */
  var lastPeriod = new Date().getFullYear() + 1;

  /** Async flow control library.
   * @type Object
   * @private
   * @fieldOf VoteImporter#
   */
  var async = require("async");

  /** Utility to extend objects.
   * @type {Function}
   * @private
   * @fieldOf VoteImporter#
   */
  var extend = require("extend");

  /** Utility to extract text from PDFs using pdftotext.
   * @type {Function}
   * @private
   * @fieldOf VoteImporter#
   */
  var extract = require('pdf-text-extract')

  /** Regular expression to match a single vote. Matches:
   *
   * LAST, name    Political party name    Province    AFIRMATIVO
   *
   * @type {RegExp}
   * @private
   * @fieldOf VoteImporter#
   */
  var VOTE_EXPR = /([\w-,\s])+(AFIRMATIVO|ABSTENCION|NEGATIVO|AUSENTE)/;

  /** Regular expression to match bill general information. Matches:
   *
   * Expediente 3-PE-10 - Orden del Día N° 6
   * Expediente 0017-S-14 - Orden del Día 104
   * Expediente 09-PE-13 Orden del Día 2704 Artículo 3
   * Expediente 128-S-11 - Orden Del Dia 1812
   * Expedente 183-S-12 - Votación en General y Particular
   * Expediente 01-PE-14 Orden del Día 33
   *
   * @type {RegExp}
   * @private
   * @fieldOf VoteImporter#
   */
  var HEADER_EXPR = /(\d+-\w+-\d+).*-?.*\s*(\d+).*-?/;

  /** Regular expression to match document extended information. Matches:
   *
   * Acta Nº 1       Ult.Mod.Ver 2       Fecha: 21/05/2014     Hora: 22:33
   *
   * @type {RegExp}
   * @private
   * @fieldOf VoteImporter#
   */
  var INFO_EXPR = /Acta Nº (\d+)\s+Ult\.Mod\.Ver (\d+)\s+Fecha\: (\d+\/\d+\/\d+)\s+Hora\: (\d+:\d+)/;

  /** Extracts votes from the specified document for the specified bill.
   * @param {Object} billInfo Object containing bill information. Cannot be
   *    null.
   * @param {Object} fileStream Stream to read the PDF document that contains
   *    all votes. Cannot be null.
   * @param {Function} callback Invoked to continue parsing the next document.
   *    Cannot be null.
   * @private
   * @methodOf VoteImporter#
   */
  var extractVotes = function (billInfo, fileStream, callback) {
    importer.writeTempFile(fileStream, function (file) {
      extract(file, {
        "-layout": ""
      }, function (err, pages) {

        var extendedInfo;
        var vote;

        if (err) {
          return callback(err)
        }

        billInfo.votes = [];

        pages.toString().split("\n").forEach(function (line) {
          if (!billInfo.date && INFO_EXPR.test(line)) {
            extendedInfo = INFO_EXPR.exec(line);

            extend(billInfo, {
              document: extendedInfo[1],
              version: extendedInfo[2],
              date: importer.convertDate(extendedInfo[3]),
              hour: extendedInfo[4]
            });
          }
          if (VOTE_EXPR.test(line)) {
            vote = line.split(/\s{2,}/);

            if (!vote[0]) {
              billInfo.votes.push({
                name: vote[1],
                party: vote[2],
                province: vote[3],
                vote: vote[4]
              });
            }
          }
        });
        importer.store(importer.generateId(billInfo.description), billInfo,
          callback);
      })
    });
  };

  /** Proccesses the period index page.
   *
   * @param {String} url Url of the period index page. Cannot be null or
   *    empty.
   * @param {Function} callback Invoked to process the next period. It
   *    takes an error. Cannot be null.
   * @private
   * @methodOf VoteImporter#
   */
  var processPeriod = function (url, callback) {
    importer.initEnv(url, function (errors, window) {
      if (errors || !window) {
        callback(new Error("Response error: " + errors));
      }
      var filesEl = window.jQuery("ul > li > ul > li > ul > li > a");

      if (filesEl.length === 0) {
        return callback(new Error("Bad response."));
      }

      // Parses files in groups of 4 elements.
      async.forEachLimit(filesEl, 4, function (fileEl, next) {
        var fileUrl = window.jQuery(fileEl).attr("href");
        var fileInfoData = window.jQuery(fileEl).text();
        var fileInfo;
        var billInfo = {
          description: fileInfoData
        };

        if (HEADER_EXPR.test(fileInfoData)) {
          fileInfo = HEADER_EXPR.exec(fileInfoData);
          extend(billInfo, {
            file: importer.errorIfEmpty(fileInfo[1]),
            orderPaper: fileInfo[2]
          });

          LOG.info("Importing votes for file " + billInfo.file);
        }

        options.queryCache.put(fileUrl, function (err) {
          options.queryCache.get(fileUrl, function (err, stream) {
            if (err) {
              return next(err);
            }
            extractVotes(billInfo, stream, next);
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
      processPeriod(task.data.url, callback);
    },

    /** Enqueues a new task. Tasks will be executed as soon as the pool has
     * space for new elements.
     * @return {Object} Returns the task to enqueue, never null.
     */
    enqueueTask: function () {
      if (lastPeriod === BASE_PERIOD) {
        return null;
      }

      lastPeriod -= 1;

      return {
        name: "Import Votes [Period " + lastPeriod + "]",
        data: {
          url: URL.replace("{0}", lastPeriod)
        }
      };
    }
  });
};
