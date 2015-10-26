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
module.exports = function BillImporter(context, options) {

  /** Softpage document format supported by this reader.
   * @constant
   * @private
   */
  var DATA_SOURCE = "http://www1.hcdn.gov.ar/proyectos_search/resultado.asp?" +
    "ordenar=2" +
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

  /** Default logger. */
  var debug = require("debug")("bill_importer");

  /** Async flow contro library.
   * @type Object
   * @private
   */
  var async = require("async");

  /** Default configuration. */
  var config = Object.assign({
    startPage: options && options.startPage || 0,
    pageSize: options && options.pageSize || 1000,
    resume: options && options.resume || false,
    poolSize: options && options.poolSize || 4,
    name: options && options.name || "bills"
  }, options);

  /** Expression that indicates the end of data.
   * @type RegExp
   * @private
   */
  var EOF_EXPR = /No se encuentra la info/;

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Represents a single bill document.
   * @type {Function}
   */
  var BillDocumentParser = require("./BillDocumentParser");

  /** Indicates whether the import process finished. */
  var finished = false;

  /** Processes a single document.
   * @param {Cheerio} $ Document virtual DOM context. Cannot be null.
   * @param {Object} document Document element to parse. Cannot be null.
   */
  var processDocument = function ($, document) {
    return new Promise((resolve, reject) => {
      var bill = new BillDocumentParser($, document);
      bill.parse()
        .then(function (rawBill) {
          context.store(rawBill.file, rawBill)
            .then(resolve)
            .catch(reject);
        }).catch(reject);
    });
  };

  /** Retrieves and parses the specified page.
   *
   * @param {Number} pageNumber Page to fetch. Cannot be null.
   * @private
   */
  var processPage = function (pageNumber) {
    return new Promise((resolve, reject) => {
      var now = new Date();
      var url = DATA_SOURCE
        .replace("${endDate}", now.getDate() + "/" + (now.getMonth() + 1) +
          "/" + now.getFullYear())
        .replace("${pageNumber}", pageNumber)
        .replace("${pageSize}", config.pageSize);

      context.load(url).then($ => {
        var documents = $(".toc");

        debug("processing %s documents in page %s", documents.length,
          pageNumber);

        if (documents.length === 0) {
          if (EOF_EXPR.test($("> div").html())) {
            debug("no more data available");
            finished = true;
            return resolve();
          } else {
            debug("error processing page " + pageNumber);
            return reject(new Error("Empty response, maybe querying error?"));
          }
        }

        // Parses bills in groups of 100 elements.
        async.forEachLimit(documents, 100, (document, next) =>
          processDocument($, document).nodeify(next), err => {
            if (err) {
              debug("error processing bill: %s", err);
              reject(err);
            } else
              resolve();
          });
      }).catch(reject);
    });
  };

  /** Generator to enqueue more pages into the pool.
   * @param {Number} [startPage] Page to start the scrapping.
   */
  var addMorePages = function* (startPage) {
    var pageCount = startPage || 0;
    var size = config.poolSize * 2;
    var i;

    while (finished === false) {
      debug("adding pages from %s to %s", pageCount, pageCount + size);

      for (i = 0; i < size; i++) {
        pageCount += 1;

        context.pool.push({
          name: "Import Bills [Page " + pageCount + "]",
          pageNumber: pageCount
        }, 100, "bill");
      }

      yield pageCount;
    }

    context.emit("finish", config.name);
  };

  var executeTask = function (task, resolve, reject) {

    if (finished) {
      return resolve();
    }

    debug("executing task: %s", JSON.stringify(task));

    processPage(task.pageNumber).then(() => {
      debug("task finished ok: %s", JSON.stringify(task));
      resolve();
    }).catch(err => {
      debug("task finished with errors. Task: %s; Error: %s",
        JSON.stringify(task), err);
      reject(err);
    });
  };

  return {
    /** Runs this importer.
     * @return {Promise} a promise to notify when the import process finished,
     *    never null.
     */
    run () {
      return new Promise((resolve, reject) => {
        var pageIterator = addMorePages(config.startPage);
        context.pool.on("drain", () => pageIterator.next());
        context.pool.on("bill", executeTask);
        context.on("finish", resolve);
        pageIterator.next();
      });
    },

    /** Indicates whether a bill changed in relation to the old bill group.
     */
    changed (oldBillGroup, newBill) {
      var newDate = Date.parse(newBill.creationTime);

      return !oldBillGroup.some(item =>
        Date.parse(item.creationTime) === newDate);
    }
  };
};
