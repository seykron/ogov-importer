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
  var Importer = require("../Importer");

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
  var extract = require('pdf-text-extract');

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

  /** Regular expression to match referenced bills.
   *
   * @type {RegExp}
   * @private
   * @fieldOf VoteImporter#
   */
  var FILE_EXPR = /(\d+-\w+-\d+)/;

  /** Regular expression to match document extended information. Matches:
   *
   * Acta Nº 1       Ult.Mod.Ver 2       Fecha: 21/05/2014     Hora: 22:33
   *
   * @type {RegExp}
   * @private
   * @fieldOf VoteImporter#
   */
  var INFO_EXPR = /Acta Nº (\d+)\s+Ult\.Mod\.Ver (\d+)\s+Fecha\: (\d+\/\d+\/\d+)\s+Hora\: (\d+:\d+)/;

  /** Regular expression to match header summary information. Matches:
   *
   * Base Mayoría: Votos Emitidos     Tipo de Mayoría: Más de la mitad    Tipo de Quorum: Más de la mitad
   *
   * @type {RegExp}
   * @private
   * @fieldOf VoteImporter#
   */
  var SUMMARY_EXPR = /Base Mayor.?a:(.+)\s+Tipo de Mayor.?a:(.+)\s+Tipo de Quorum:(.+)/;

  /** Regular expression to match motion result information. Matches:
   *
   * Miembros del cuerpo: 257       Resultado de la Votación: AFIRMATIVO
   *
   * @type {RegExp}
   * @private
   * @fieldOf VoteImporter#
   */
  var RESULT_EXPR = /Miembros del cuerpo:(\d+)\s+Resultado de la Votación:(.+)/;

  /** Regular expression to match affirmative votes information. Matches:
   *
   * Presentes 224  0  224    Votos Afirmativos 142  0  0  142
   *
   * @type {RegExp}
   * @private
   * @fieldOf VoteImporter#
   */
  var VOTE_PASS_EXPR = /Presentes\s+(\d+)\s+(\d+)\s+(\d+)\s+Votos Afirmativos\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+)/;

  /** Regular expression to match negative votes information. Matches:
   *
   * Ausentes 224    Votos Negativos 142  0  0  142
   *
   * @type {RegExp}
   * @private
   * @fieldOf VoteImporter#
   */
  var VOTE_FAIL_EXPR = /Ausentes\s+(\d+)\s+Votos Negativos\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/;

  /** Regular expression to match abstentions. Matches:
   *
   * Abstenciones   142   0    142
   *
   * @type {RegExp}
   * @private
   * @fieldOf VoteImporter#
   */
  var VOTE_ABST_EXPR = /Abstenciones\s+(\d+)\s+(\d+)\s+(\d+)/;

  /** Fetches the PDF document either from the cache or from the network.
   *
   * @param {String} fileUrl Url of the document. Cannot be null.
   * @param {Function} callback Invoked to provide the document. It takes an
   *    error and a read stream for the document. Cannot be null.
   * @private
   * @methodOf VoteImporter#
   */
  var fetchDocument = function (fileUrl, callback) {
    options.queryCache.exists(fileUrl, function(err, exists) {
      if (err) {
        return callback(err);
      }
      if (exists) {
        options.queryCache.get(fileUrl, callback);
      } else {
        options.queryCache.put(fileUrl, function (err) {
          if (err) {
            callback(err);
          } else {
            options.queryCache.get(fileUrl, callback);
          }
        });
      }
    });
  };

  /** Extracts information from the motion header section, if possible.
   *
   * @param {Object} billInfo Bill to extract information for. Cannot be null.
   * @param {String} line Libe being processed. Cannot be null or empty.
   * @param {RegExp} expr Expression to test and parse line. Cannot be null.
   * @param {Number} matches Number of expected matches. Cannot be null.
   * @param {Function} callback Receives the array with regexp matches. Must
   *    return an object to extend the summary. Cannot be null.
   * @private
   * @methodOf VoteImporter#
   */
  var extractHeaderInfo = function (billInfo, line, expr, matches, callback) {
    var lineData;

    if (expr.test(line)) {
      lineData = expr.exec(line);
      if (lineData.length !== matches) {
        throw new Error("Invalid motion: " + billInfo.file);
      }
      extend(billInfo.summary, callback(lineData));
    }
  };

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
  var extractVotes = function (billInfo, page) {
    var extendedInfo;
    var vote;
    var hasFooter = false;

    page.split("\n").forEach(function (line) {
      if (!billInfo.date && INFO_EXPR.test(line)) {
        extendedInfo = INFO_EXPR.exec(line);

        extend(billInfo, {
          document: extendedInfo[1],
          version: extendedInfo[2],
          date: importer.convertDate(extendedInfo[3]),
          hour: extendedInfo[4]
        });
      }
      // Tries to extract summary information.
      extractHeaderInfo(billInfo, line, SUMMARY_EXPR, 4, function (lineData) {
        return {
          majorityBase: importer.trim(lineData[1]),
          majorityType: importer.trim(lineData[2]),
          quorum: importer.trim(lineData[3])
        };
      });
      // Tries to extract motion results information.
      extractHeaderInfo(billInfo, line, RESULT_EXPR, 3, function (lineData) {
        return {
          numberOfMembers: importer.trim(lineData[1]),
          result: importer.trim(lineData[2])
        };
      });
      // Tries to extract number of affirmative votes and
      // present people information.
      extractHeaderInfo(billInfo, line, VOTE_PASS_EXPR, 8, function (lineData) {
        return {
          present: {
            identified: importer.trim(lineData[1]),
            unknown: importer.trim(lineData[2]),
            total: importer.trim(lineData[3]),
          },
          affirmative: {
            members: importer.trim(lineData[4]),
            president: importer.trim(lineData[5]),
            castingVote: importer.trim(lineData[6]),
            total: importer.trim(lineData[7])
          }
        };
      });
      // Tries to extract number of negative votes and
      // absent people information.
      extractHeaderInfo(billInfo, line, VOTE_FAIL_EXPR, 6, function (lineData) {
        return {
          absent: importer.trim(lineData[1]),
          negative: {
            members: importer.trim(lineData[2]),
            president: importer.trim(lineData[3]),
            castingVote: importer.trim(lineData[4]),
            total: importer.trim(lineData[5])
          }
        };
      });
      // Tries to extract number of abstentions.
      extractHeaderInfo(billInfo, line, VOTE_ABST_EXPR, 4, function (lineData) {
        return {
          abstention: {
            members: importer.trim(lineData[1]),
            president: importer.trim(lineData[2]),
            total: importer.trim(lineData[3])
          }
        };
      });
      if (line.indexOf("Observaciones:") > -1) {
        hasFooter = true;
      }
      if (VOTE_EXPR.test(line)) {
        vote = line.split(/\s{2,}/);

        if (importer.trim(vote[0]) === "") {
          billInfo.votes.push({
            name: vote[1],
            party: vote[2],
            province: vote[3],
            vote: vote[4]
          });
        }
      }
      if (FILE_EXPR.test(line) && hasFooter) {
        if (billInfo.references.summary) {
          billInfo.references.summary += line;
        } else {
          billInfo.references.summary = line;
        }

        line.split(FILE_EXPR).forEach(function (reference) {
          var file;

          if (FILE_EXPR.test(reference)) {
            file = importer.normalizeFile(reference);

            if (file !== billInfo.file &&
              billInfo.references.files.indexOf(file) === -1) {
              billInfo.references.files.push(file);
            }
          }
        });
      }
    });
  };

  /** Converts the PDF motion to text and loads it into memory to perform
   * parsing.
   * @param {Object} billInfo General information about related bill. Cannot
   *    be null.
   * @param {String} documentUrl Url to the motion PDF file. Cannot be null or
   *    empty.
   * @param {Function} callback Invoked when the document is already parsed
   *    and saved, it takes an error as parameter. Cannot be null.
   * @private
   * @methodOf VoteImporter#
   */
  var loadDocument = function (billInfo, documentUrl, callback) {
    fetchDocument(documentUrl, function (err, stream) {
      if (err) {
        return callback(err);
      }
      importer.writeTempFile(stream, function (file) {
        try {
          extract(file, {
            "-layout": ""
          }, function (err, pages) {
            if (err) {
              LOG.error("Bill " + billInfo.file + " failed: " + err);
              return callback(null);
            }
            billInfo.votes = [];
            billInfo.summary = {};
            billInfo.references = {
              summary: null,
              files: []
            };
            pages.forEach(function (page) {
              extractVotes(billInfo, page);
            });

            importer.store(billInfo.id, billInfo, callback);
          });
        } catch(cause) {
          LOG.error("Bill " + billInfo.file + " failed: " + cause);
          callback(null);
        }
      });
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
    importer.initEnv(url, function (errors, $) {
      var filesEl;

      if (errors) {
        return callback(new Error("Response error: " + errors));
      }

      filesEl = $(".treeview a");

      if (filesEl.length === 0) {
        return callback(new Error("Bad response."));
      }

      // Parses files in groups of 4 elements.
      async.forEachLimit(filesEl, 4, function (fileEl, nextFile) {
        var fileUrl = $(fileEl).attr("href");
        var fileInfoData = $(fileEl).text();
        var fileInfo;
        var billInfo = {
          id: importer.generateId(fileInfoData),
          description: fileInfoData,
          url: fileUrl
        };

        if (HEADER_EXPR.test(fileInfoData)) {
          fileInfo = HEADER_EXPR.exec(fileInfoData);
          extend(billInfo, {
            file: importer.normalizeFile(importer.errorIfEmpty(fileInfo[1])),
            orderPaper: fileInfo[2]
          });

          LOG.info("Importing votes for file " + billInfo.file);
        }

        loadDocument(billInfo, fileUrl, nextFile);

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
