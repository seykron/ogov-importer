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

  /** Class logger, using the default if no one is provided.
   * @type winston.Logger
   * @constant
   * @private
   */
  var LOG = options && options.logger || require("winston");

  /** Number of concurrently tasks scrapping pages at the same time.
   * @type Number
   * @constant
   * @private
   * @fieldOf OG.importer.BillImporter#
   */
  var POOL_SIZE = options && options.poolSize || 2;

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

  /** JSDom library to parse results.
   * @type Object
   * @private
   * @fieldOf OG.importer.BillImporter#
   */
  var jsdom = require("jsdom");

  /** List of storers to save imported bills.
   * @type {Object[]}
   * @private
   * @fieldOf BillImporter#
   */
  var storers = options.storers || [];

  /** Last queued page.
   * @type Number
   * @private
   * @fieldOf OG.importer.BillImporter#
   */
  var pageCount = options.startPage || 0;

  /** Flag that indicates whether to stop the importer.
   * @type Boolean
   * @private
   * @fieldOf OG.importer.BillImporter#
   */
  var stop = false;

  /** Simple HTTP client for node.
   * @type {Function}
   * @private
   * @fieldOf BillImporter#
   */
  var request = require("request");

  /** Removes spaces at the beginning and at the end of the specified String.
   * @param {String} string String to trim. Cannot be null.
   * @return {String} The trimmed String. Never returns null.
   * @private
   * @methodOf OG.importer.BillImporter#
   */
  var trim = function (string) {
    return string.replace(/^\s/, "").replace(/\s+$/, "");
  };

  /** Converts a date string from format dd/MM/YYYY to Date.
   * @param {String} dateString Date in the expected format. Cannot be null or
   *   empty.
   * @return {Date} Returns the date object that represents the provided date.
   *   Never returns null.
   * @private
   * @methodOf OG.importer.BillImporter#
   */
  var convertDate = function (dateString) {
    var period = dateString.split("/");
    return new Date(period[1] + "/" + period[0] + "/" + period[2]);
  };

  /** Returns the element text or throws an error if it doesn't exist.
   * @param {Element} element Element to get text from. Cannot be null.
   * @param {String} [errorMessage] Error message thrown if the element text
   *   is null or empty. Can be null.
   * @return {String} Returns the required text.
   * @private
   * @methodOf OG.importer.BillImporter#
   */
  var errorIfEmpty = function (element, errorMessage) {
    if (!element || !element.textContent) {
      throw new Error(errorMessage || "Empty element found");
    }
    return trim(element.textContent);
  };

  /** Returns the element text or a default String if it doesn't exist.
   * @param {Element} element Element to get text from. Cannot be null.
   * @param {String} [defaultText] Default String used if the element doesn't
   *   contain text. Can be null.
   * @return {String} Returns the required text, or empty if it cannot be
   *   resolved.
   * @private
   * @methodOf OG.importer.BillImporter#
   */
  var defaultIfEmpty = function (element, defaultText) {
    var content = defaultText || "";
    if (element && element.textContent) {
      content = element.textContent;
    }
    return trim(content);
  };

  /** Retrieves the specified page. It uses the cache if possible.
   *
   * @param {Number} pageNumber Page to fetch. Cannot be null.
   * @param {Function} callback Callback that receives results. Cannot be null.
   * @private
   * @methodOf OG.importer.BillImporter#
   */
  var fetchPage = function (pageNumber, callback) {
    var now = new Date();
    var url = DATA_SOURCE
      .replace("${endDate}", now.getDate() + "/" + now.getMonth() + "/" +
        now.getFullYear())
      .replace("${pageNumber}", pageNumber)
      .replace("${pageSize}", options && options.pageSize || 1000);

    if (options.queryCache) {
      options.queryCache.get(url, function (err, pageData) {
        if (err) {
          LOG.info("Fetching page " + pageNumber + ": " + url);

          request(url, function (err, response, body) {
            if (!err && response.statusCode === 200) {
              options.queryCache.put(url, body);

              callback(null, body);
            } else {
              callback(err);
            }
          });
        } else {
          LOG.info("Page " + pageNumber + " retrieved from the cache.");
          callback(null, pageData);
        }
      });
    } else {
      LOG.info("Fetching page " + pageNumber + ": " + url);

      callback(null, url);
    }
  };

  /** Retrieves and parses the specified page.
   *
   * @param {Number} pageNumber Page to fetch. Cannot be null.
   * @param {Function} callback Callback that receives results. Cannot be null.
   * @private
   * @methodOf OG.importer.BillImporter#
   */
  var processPage = function (pageNumber, callback) {

    fetchPage(pageNumber, function (err, pageData) {
      if (err) {
        return callback(err);
      }

      // TODO(seykron): most of time in the process is the DOM parsing. Find
      // a better implementation.
      jsdom.env(pageData, ["./jquery.js"], function (errors, window) {
        var documents = window.jQuery(".toc");

        LOG.info("Processing page " + pageNumber + "...");

        if (errors) {
          LOG.info("Error processing page " + pageNumber + ": " + errors);

          return callback(new Error(errors));
        }

        if (documents.length === 0) {
          LOG.info("Error processing page " + pageNumber);

          return callback(new Error("Empty response, maybe querying error?"));
        }

        // Parses bills in groups of 10 elements.
        async.forEachLimit(documents, 10, function (document, next) {
          var rawBill = {};
          var context = {
            jQuery: window.jQuery,
            document: window.jQuery(document)
          };

          async.waterfall([
            async.apply(extractBill, context, rawBill),
            async.apply(extractSubscribers, context, rawBill),
            async.apply(extractCommittees, context, rawBill),
            async.apply(extractDictums, context, rawBill),
            async.apply(extractProcedures, context, rawBill)
          ], function (err) {
            var billData = {
              source: document.innerHTML,
              error: err || null,
              bill: rawBill
            };
            // Stores bills using configured storers.
            async.each(storers, function (storer, nextStorer) {
              storer.store(billData, nextStorer);
            }, next);
          });
        }, callback);
      });
    })
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
        rowData = context.jQuery(rows.get(i)).children();

        // Skips the table title.
        if (rowData.find("span").length === 0) {
          elements.push(extractor(rowData));
        }
      };

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
    var subscribersRows = context.document.find("div.item1:eq(0) > table > tr");

    parseTable(context, subscribersRows, function (subscriberData) {
      return {
        name: errorIfEmpty(subscriberData.get(0)),
        party: defaultIfEmpty(subscriberData.get(1), "NONE"),
        province: errorIfEmpty(subscriberData.get(2))
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
    var committeesRows = context.document.find("div.item1:eq(1) > table > tr");

    parseTable(context, committeesRows, function (committeeData) {
      return errorIfEmpty(committeeData.get(0));
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
    var dictumsRows = context.document.find("div.item1:eq(2) > table > tr");

    parseTable(context, dictumsRows, function (dictumData) {
      return {
        file: rawBill.file,
        source: errorIfEmpty(dictumData.get(0)),
        orderPaper: errorIfEmpty(dictumData.get(1)),
        date: convertDate(defaultIfEmpty(dictumData.get(2))),
        result: defaultIfEmpty(dictumData.get(3))
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
    var proceduresRows = context.document.find("div.item1:eq(3) > table > tr");

    parseTable(context, proceduresRows, function (procedureData) {
      return {
        file: rawBill.file,
        source: errorIfEmpty(procedureData.get(0)),
        topic: defaultIfEmpty(procedureData.get(1)),
        date: convertDate(defaultIfEmpty(procedureData.get(2))),
        result: defaultIfEmpty(procedureData.get(3))
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
    var document = context.document;
    var generalInformation = document.find("span.item1 > div").contents();
    var file = errorIfEmpty(generalInformation.get(3));

    try {
      extend(rawBill, {
        type: document.find(".item1 > b").text(),
        source: errorIfEmpty(generalInformation.get(1)),
        file: file,
        publishedOn: errorIfEmpty(generalInformation.get(6)),
        creationTime: convertDate(errorIfEmpty(generalInformation.get(8)))
      });

      if (generalInformation.length > 10) {
        // Standard format, no additional information.
        extend(rawBill, {
          summary: defaultIfEmpty(generalInformation.get(11))
        });
      } else {
        // Must get additional information.
        generalInformation = document.find("span.item1 > div > div").contents();

        extend(rawBill, {
          revisionChamber: defaultIfEmpty(generalInformation.get(1)),
          revisionFile: defaultIfEmpty(generalInformation.get(3)),
          summary: defaultIfEmpty(generalInformation.get(6)) ||
            defaultIfEmpty(generalInformation.get(7))
        });
      }
      callback(null);
    } catch (err) {
      callback(err);
    }
  };

  return {

    /** Starts the importer and notifies every time a page is ready.
     *
     * @param {Function} [progressCallback] Function invoked when a group of
     *    pages are already processed.
     */
    start: function (progressCallback) {
      var queue = async.queue(function (pageNumber, callback) {
        if (stop) {
          LOG.info("Page " + pageNumber + " import aborted.");
          return callback();
        }

        processPage(pageNumber, function (err) {
          if (err) {
            LOG.info("Import halted by the client: " + err);
          }
          if (!stop){
            stop = err ? true : false;
          }
          callback();
        });
      }, POOL_SIZE);

      queue.empty = function () {
        var i;
        if (stop) {
          return;
        }

        if (pageCount % POOL_SIZE === 0 && progressCallback) {
          progressCallback();
        }

        LOG.info("Queue empty. Adding another " + POOL_SIZE +
          " pages to the queue.");
        for (i = 0; i < POOL_SIZE; i++) {
          queue.push(++pageCount);
        }
      };

      queue.empty();
    },

    /** Stops the import process after current pages are finished.
     */
    stop: function () {
      stop = true;
    }
  };
};
