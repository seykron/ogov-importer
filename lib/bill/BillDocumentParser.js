/** Represents a single bill being parsed.
 * @param {Cheerio} $ Parsing DOM context. Cannot be null.
 * @param {Object} document DOM document with bill information. Cannot be null.
 */
module.exports = function BillDocumentParser($, document) {

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Extracts the order paper number from the specified line.
   * @param {String} line Line that contains the required order paper. Cannot be
   *    null or empty.
   * @return {String} The order paper number if it is found, or the line as it
   *    was provided, never null or empty.
   * @private
   */
  var extractOrderPaper = function (line) {
    var orderPaperExp = /(\d+\/\d+)/;
    var orderPaper = line;

    if (orderPaperExp.test(line)) {
      orderPaper = line.match(orderPaperExp).pop();
    }
    return orderPaper;
  };

  /** Extracts the list of subscribers within the bill.
   *
   * @return {Object[]} A list of subscribers, never null.
   * @private
   */
  var extractSubscribers = function () {
    var subscribersRows = $("div.item1", document).eq(0).find("> table > tr");

    return subscribersRows.asList().map(row => ({
      name: row.eq(0).errorIfEmpty(),
      party: row.eq(1).defaultIfEmpty("NONE"),
      province: row.eq(2).errorIfEmpty()
    }));
  };

  /** Extracts the list of committees that reviewed the bill.
   *
   * @return {Object[]} A list of committees, never null.
   * @private
   */
  var extractCommittees = function () {
    var committeesRows = $("div.item1", document).eq(1).find("> table > tr");

    return committeesRows.asList().map(row => row.eq(0).errorIfEmpty());
  };

  /** Extracts the list of dictums over the bill.
   *
   * @param {String} file Related bill identifier. Cannot be null or empty.
   * @return {Object[]} A list of dictums, never null.
   * @private
   */
  var extractDictums = function (file) {
    var dictumsRows = $("div.item1", document).eq(2).find("> table > tr");

    return dictumsRows.asList().map(dictumData => {
      var orderPaperEl = dictumData.eq(1).find("a");
      var orderPaperNumber = extractOrderPaper(dictumData.eq(1).errorIfEmpty());
      var date = dictumData.eq(2).toDate();
      var result = dictumData.eq(3).defaultIfEmpty();
      var url;

      if (orderPaperEl.length > 0) {
        url = orderPaperEl.extractUrl();
        date = dictumData.eq(3).toDate();
        result = dictumData.eq(4).defaultIfEmpty();
      }

      return {
        file: file,
        source: dictumData.eq(0).errorIfEmpty(),
        orderPaper: orderPaperNumber,
        date: date,
        result: result,
        url: url
      };
    });
  };

  /** Extracts the list of procedures for the bill.
   *
   * @param {String} file Related bill identifier. Cannot be null or empty.
   * @return {Object[]} A list of procedures, never null.
   * @private
   */
  var extractProcedures = function (file) {
    var proceduresRows = $("div.item1", document).eq(3).find("> table > tr");

    return proceduresRows.asList().map(procedure => ({
      file: file,
      source: procedure.eq(0).errorIfEmpty(),
      topic: procedure.eq(1).defaultIfEmpty(),
      date: procedure.eq(2).toDate(),
      result: procedure.eq(3).defaultIfEmpty()
    }));
  };

  /** Extracts bill general information and stores it into the bill.
   *
   * @return {Object} the raw bill with general information, never null.
   * @private
   */
  var extractBill = function () {
    var generalInformation = $("span.item1 > div", document).contents();
    var file = generalInformation.eq(3).errorIfEmpty();
    var url;
    var bill = {
      type: $(".item1 > b", document).errorIfEmpty(),
      source: generalInformation.eq(1).trim(),
      file: file,
      publishedOn: generalInformation.eq(6).errorIfEmpty(),
      creationTime: generalInformation.eq(8).toDate(),
      lastModified: generalInformation.eq(8).toDate()
    };
    var summary;
    var textUrl;

    if (generalInformation.find("a").length > 0) {
      textUrl = generalInformation.find("a").extractUrl();
    }
    if (generalInformation.length > 10) {
      // Standard format, no additional information.
      summary = generalInformation.eq(11).defaultIfEmpty();
    } else {
      // Must get additional information.
      generalInformation = $("span.item1 > div > div", document).contents();

      Object.assign(bill, {
        revisionChamber: generalInformation.eq(1).defaultIfEmpty(),
        revisionFile: generalInformation.eq(3).defaultIfEmpty(),
        summary: generalInformation.eq(6).defaultIfEmpty() ||
          generalInformation.eq(7).defaultIfEmpty()
      });
    }
    return Object.assign(bill, {
      summary: summary,
      textUrl: textUrl
    });
  };

  return {
    /** Parses the bill document.
     * @return {Promise<Object|Error>} Returns a promise to receive the parsed
     *    bill object, never null.
     */
    parse () {
      return new Promise((resolve, reject) => {
        resolve(Object.assign(extractBill(), {
          subscribers: extractSubscribers(),
          committees: extractCommittees(),
          dictums: extractDictums(),
          procedures: extractProcedures()
        }));
      })
    }
  };
};
