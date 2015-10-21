module.exports = function BillHistory(dataFile, options) {

  const HistoryConfig = Object.assign({
    indexKeyName: "file"
  }, options);

  var path = require("path");

  var History = require("../History");

  var FileSystemStorer = require("../FileSystemStorer");

  var storer = new FileSystemStorer(path.dirname(dataFile), "billsHistory.js");

  var debug = require("debug")("bill_history");

  var config = Object.assign({
    from: Date.parse("2001-01-01"),
    to: Date.now()
  }, HistoryConfig);

  var compare = function (bill1, bill2) {
    return Date.parse(bill1.creationTime) < Date.parse(bill2.creationTime) ? -1 : 1;
  };

  var changed = function (oldBillGroup, newBill) {
    return oldBillGroup[oldBillGroup.length - 1].creationTime !==
      newBill.creationTime;
  };

  var history = new History(dataFile, storer, {
    changed: changed,
    compare: compare
  }, HistoryConfig);

  return {
    load () {
      return history.load();
    },

    store (file, bill) {
      return history.store(file, bill);
    },

    size () {
      return history.size();
    },

    close () {
      storer.close();
    }
  };
};
