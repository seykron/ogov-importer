/** Imports bills from the HCDN database.
 * As HCDN database isn't exposed via API, it scraps search results.
 *
 * @param {Object} [options] Importer configuration. Cannot be null.
 * @param {Number} [options.pageSize] Number of bills to retrieve per hit.
 *   Default is 1000.
 * @param {Number} [options.poolSize] Number of concurrent tasks fetching
 *   results at the same time. Default is 2.
 * @param {winston.Logger} [options.logger] Logger for this class. Can be null.
 * @constructor
 */
module.exports = function BillImporter(options) {

  /** Base class to inherit behaviour from.
   * @type {Function}
   * @private
   * @fieldOf BillImporter#
   */
  var Importer = require("../Importer");

  /** Current importer instance.
   * @type {Importer}
   * @private
   * @fieldOf BillImporter#
   */
  var importer = new Importer(options);

  /** Class logger, using the default if no one is provided.
   * @type winston.Logger
   * @constant
   * @private
   */
  var LOG = options && options.logger || require("winston");

  /** Softpage document format supported by this reader.
   * @constant
   * @private
   * @fieldOf OG.importer.BillImporter#
   */
  var DATA_SOURCE = "http://www1.hcdn.gov.ar/proyectos_search/resultado.asp?" +
    "ordenar=3" +
    "&chkDictamenes=on" +         // Get dictums.
    "&chkFirmantes=on" +          // Get subscribers.
    "&chkTramite=on" +            // Get parliamentary procedures.
    "&chkComisiones=on" +         // Get committees.
    "&fecha_inicio=01/01/1999" +  // Bills start date.
    "&fecha_fin=${endDate}" +     // Bills end date.
    "&whichpage=${pageNumber}" +  // Page number to fetch.
    "&pagesize=${pageSize}" +     // Number of bills per page.
    "&giro_giradoA=" +             // Required to make it work.
    "&odanno=" +                  // Required to make it work.
    "&pageorig=1" +               // Required to make it work.
    "&fromForm=1";                // Required to make it work.

  /** Async flow contro library.
   * @type Object
   * @private
   * @fieldOf OG.importer.BillImporter#
   */
  var async = require("async");

  /** Utility to extend objects.
   * @type {Function}
   * @private
   * @fieldOf BillImporter#
   */
  var extend = require("extend");

  /** Last queued page.
   * @type Number
   * @private
   * @fieldOf OG.importer.BillImporter#
   */
  var pageCount = options.startPage || 0;

  /** Regexp to extract a url from the javascript function to open popups.
   * Matches: javascript:OpenWindow("http://real-url-goes-here",400,400)
   * @type RegExp
   * @private
   * @fieldOf OG.importer.BillImporter#
   */
  var EXTRACT_URL = /[\"\'](.*)[\"\']/;

  /** Expression that indicates the end of data.
   * @type RegExp
   * @private
   * @fieldOf OG.importer.BillImporter#
   */
  var EOF_EXPR = /No se encuentra la info/;

  /** Error when there's no more data available.
   * @type {Error}
   * @private
   * @fieldOf OG.importer.BillImporter#
   */
  var EOF_ERR = new Error("No more data available.");

  /** Last error in the import process.
   * @type {Error}
   * @private
   * @fieldOf OG.importer.BillImporter#
   */
  var lastError = null;

  /** Extracts the order paper number from the specified line.
   * @param {String} line Line that contains the required order paper. Cannot be
   *    null or empty.
   * @return {String} The order paper number if it is found, or the line as it
   *    was provided, never null or empty.
   * @private
   * @methodOf OG.importer.BillImporter#
   */
  var extractOrderPaper = function (line) {
    var orderPaperExp = /(\d+\/\d+)/;
    var orderPaper = line;

    if (orderPaperExp.test(line)) {
      orderPaper = line.match(orderPaperExp).pop();
    }
    return orderPaper;
  };

  /** Retrieves and parses the specified page.
   *
   * @param {Number} pageNumber Page to fetch. Cannot be null.
   * @param {Function} callback Callback that receives results. Cannot be null.
   * @private
   * @methodOf OG.importer.BillImporter#
   */
  var processPage = function (pageNumber, callback) {
    var now = new Date();
    var url = DATA_SOURCE
      .replace("${endDate}", now.getDate() + "/" + (now.getMonth() + 1) + "/" +
        now.getFullYear())
      .replace("${pageNumber}", pageNumber)
      .replace("${pageSize}", options && options.pageSize || 1000);

    importer.initEnv(url, function (errors, $) {
      var documents = $(".toc");

      LOG.info("Processing page " + pageNumber + "...");

      if (errors) {
        LOG.info("Error processing page " + pageNumber + ": " + errors);

        return callback(new Error(errors));
      }

      if (documents.length === 0) {
        if (EOF_EXPR.test($("> div").html())) {
          LOG.info("No more data available");
          return callback(EOF_ERR);
        } else {
          LOG.info("Error processing page " + pageNumber);
          return callback(new Error("Empty response, maybe querying error?"));
        }
      }

      // Parses bills in groups of 10 elements.
      async.forEachLimit(documents, 100, function (document, next) {
        var rawBill = {};
        var context = {
          find: function (selector, parent) {
            return $(selector, parent || document);
          }
        };

        async.waterfall([
          async.apply(extractBill, context, rawBill),
          async.apply(extractSubscribers, context, rawBill),
          async.apply(extractCommittees, context, rawBill),
          async.apply(extractDictums, context, rawBill),
          async.apply(extractProcedures, context, rawBill)
        ], function (err) {
          if (!err && rawBill.file) {
            // Stores bills using configured storers.
            importer.store(rawBill.file, rawBill, next);
          } else {
            next(err || new Error("Invalid file: " + JSON.stringify(rawBill)));
          }
        });
      }, function (err) {
        if (err) {
          console.trace(err);
        }
        callback(err);
      });
    });
  };

  /** Parses an HTML table with bill data.
   * @param {Object} context Parsing context. Cannot be null.
   * @param {Object[]} rows List of DOM table rows. Cannot be null.
   * @param {Function} extractor Extractor function, it takes a single row as
   *    parameter.
   * @param {Function} callback Invoked with the list of extracted items. Cannot
   *    be null.
   * @private
   * @methodOf BillImporter#
   */
  var parseTable = function (context, rows, extractor, callback) {
    var rowData;
    var elements = [];
    var i;

    try {
      for (i = 0; i < rows.length; i++) {
        rowData = context.find(">", rows.eq(i));

        // Skips the table title.
        if (rowData.find("span").length === 0) {
          elements.push(extractor(rowData));
        }
      }

      callback(null, elements);
    } catch (err) {
      callback(err, null);
    }
  };

  /** Extracts the list of subscribers within the bill.
   *
   * @param {Object} context Parsing context. Cannot be null.
   * @param {Object} rawBill Bill being populated. Cannot be null.
   * @param {Function} callback Callback invoked when subscribers scrapping
   *    finished. It receives an error as parameter. Cannot be null.
   * @private
   * @methodOf OG.importer.BillImporter#
   */
  var extractSubscribers = function (context, rawBill, callback) {
    var subscribersRows = context.find("div.item1").eq(0).find("> table > tr");

    parseTable(context, subscribersRows, function (subscriberData) {
      return {
        name: importer.errorIfEmpty(subscriberData.eq(0)),
        party: importer.defaultIfEmpty(subscriberData.eq(1), "NONE"),
        province: importer.errorIfEmpty(subscriberData.eq(2))
      };
    }, function (err, subscribers) {
      rawBill.subscribers = subscribers;
      callback(err);
    });
  };

  /** Extracts the list of committees that reviewed the bill.
   *
   * @param {Object} context Parsing context. Cannot be null.
   * @param {Function} callback Callback invoked when subscribers scrapping
   *    finished. It receives an error as parameter. Cannot be null.
   * @private
   * @methodOf OG.importer.BillImporter#
   */
  var extractCommittees = function (context, rawBill, callback) {
    var committeesRows = context.find("div.item1").eq(1).find("> table > tr");

    parseTable(context, committeesRows, function (committeeData) {
      return importer.errorIfEmpty(committeeData.eq(0));
    }, function (err, committees) {
      rawBill.committees = committees;
      callback(err);
    });
  };

  /** Extracts the list of dictums over the bill.
   *
   * @param {Object} context Parsing context. Cannot be null.
   * @param {Object} rawBill Bill being populated. Cannot be null.
   * @param {Function} callback Callback invoked when subscribers scrapping
   *    finished. It receives an error as parameter. Cannot be null.
   * @private
   * @methodOf OG.importer.BillImporter#
   */
  var extractDictums = function (context, rawBill, callback) {
    var dictumsRows = context.find("div.item1").eq(2).find("> table > tr");

    parseTable(context, dictumsRows, function (dictumData) {
      var orderPaperEl = dictumData.eq(1).find("a");
      var orderPaperNumber = extractOrderPaper(dictumData.eq(1).text());
      var date = dictumData.eq(2);
      var result = dictumData.eq(3);
      var url;

      if (orderPaperEl.length > 0) {
        url = orderPaperEl.attr("href").match(EXTRACT_URL).pop();
        date = dictumData.eq(3);
        result = dictumData.eq(4);
      }

      return {
        file: rawBill.file,
        source: importer.errorIfEmpty(dictumData.eq(0)),
        orderPaper: importer.errorIfEmpty(orderPaperNumber),
        date: importer.convertDate(importer.defaultIfEmpty(date)),
        result: importer.defaultIfEmpty(result),
        url: url
      };
    }, function (err, dictums) {
      rawBill.dictums = dictums;
      callback(err);
    });
  };

  /** Extracts the list of procedures for the bill.
   *
   * @param {Object} context context framework. Cannot be null.
   * @param {Object} rawBill Bill being populated. Cannot be null.
   * @param {Function} callback Callback invoked when subscribers scrapping
   *    finished. It receives an error as parameter. Cannot be null.
   * @private
   * @methodOf OG.importer.BillImporter#
   */
  var extractProcedures = function (context, rawBill, callback) {
    var proceduresRows = context.find("div.item1").eq(3).find("> table > tr");

    parseTable(context, proceduresRows, function (procedureData) {
      return {
        file: rawBill.file,
        source: importer.errorIfEmpty(procedureData.eq(0)),
        topic: importer.defaultIfEmpty(procedureData.eq(1)),
        date: importer.convertDate(importer.defaultIfEmpty(procedureData.eq(2))),
        result: importer.defaultIfEmpty(procedureData.eq(3))
      };
    }, function (err, procedures) {
      rawBill.procedures = procedures;
      callback(err);
    });
  };

  /** Extracts bill general information and stores it into the bill.
   *
   * @param {Element} context Parsing context. Cannot be null.
   * @param {Object} rawBill The bill being created. Cannot be null.
   * @param {Function} callback Invoked to continue with the next bill. Cannot
   *    be null.
   * @private
   * @methodOf OG.importer.BillImporter#
   */
  var extractBill = function (context, rawBill, callback) {
    var generalInformation = context.find("span.item1 > div").contents();
    var file = importer.errorIfEmpty(generalInformation.eq(3));
    var url;

    try {
      extend(rawBill, {
        type: importer.errorIfEmpty(context.find(".item1 > b")),
        source: importer.trim(generalInformation.eq(1)),
        file: file,
        publishedOn: importer.errorIfEmpty(generalInformation.eq(6)),
        creationTime: importer.convertDate(importer.errorIfEmpty(
          generalInformation.eq(8)))
      });

      if (generalInformation.find("a").length > 0) {
        url = generalInformation.find("a").attr("href");
        if (EXTRACT_URL.test(url)) {
          rawBill.textUrl = url.match(EXTRACT_URL).pop();
        }
      }
      if (generalInformation.length > 10) {
        // Standard format, no additional information.
        extend(rawBill, {
          summary: importer.defaultIfEmpty(generalInformation.eq(11))
        });
      } else {
        // Must get additional information.
        generalInformation = context.find("span.item1 > div > div").contents();

        extend(rawBill, {
          revisionChamber: importer.defaultIfEmpty(generalInformation.eq(1)),
          revisionFile: importer.defaultIfEmpty(generalInformation.eq(3)),
          summary: importer.defaultIfEmpty(generalInformation.eq(6)) ||
            importer.defaultIfEmpty(generalInformation.eq(7))
        });
      }
      callback(null);
    } catch (err) {
      callback(err);
    }
  };

  return extend(importer, {

    /** Executes an enqueued task. Each task fetches a single page of bills.
     *
     * @param {Object} task Task to execute. Cannot be null.
     * @param {String} task.name Task name. Cannot be null or empty.
     * @param {Object} data Task specific data. Can be null.
     */
    execute: function (task, callback) {
      processPage(task.data.pageNumber, function (err) {
        if (err === EOF_ERR) {
          lastError = err;
        }
        callback(err);
      });
    },

    /** Enqueues a new task. Tasks will be executed as soon as the pool has
     * space for new elements.
     * @return {Object} Returns the task to enqueue, never null.
     */
    enqueueTask: function () {
      if (lastError === EOF_ERR) {
        return null;
      }

      pageCount += 1;

      return {
        name: "Import Bills [Page " + pageCount + "]",
        data: {
          pageNumber: pageCount
        }
      };
    }
  });
};
