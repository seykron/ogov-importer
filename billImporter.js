var fs = require("fs");
var path = require("path");
var ogi = require("./index");

var LOG = (function () {
  var winston = require("winston");
  var logger = winston.Logger({
    transports: [
      new winston.transports.File({ filename: 'importer.log' })
    ]
  });
  return winston;
}());

var QUERY_CACHE_DIR = (function () {
  var billsDir = path.join(__dirname, "cache");
  if (!fs.existsSync(billsDir)) {
    fs.mkdirSync(billsDir);
  }
  return billsDir;
}());

var BILLS_DIR = (function () {
  var billsDir = path.join(__dirname, "bills");
  if (!fs.existsSync(billsDir)) {
    fs.mkdirSync(billsDir);
  }
  return billsDir;
}());
var lastPageFile = path.join(__dirname, "last_page.log");
var lastPage = (function () {

  if (fs.existsSync(lastPageFile)) {
    lastPage = parseInt(fs.readFileSync(lastPageFile).toString(), 10);
    if (isNaN(lastPage)) {
      lastPage = 0;
    }
  }
}());

var inMemoryStorer = new ogi.InMemoryStorer();

var importer = new ogi.BillImporter({
  lastPage: lastPage,
  poolSize: 4,
  pageSize: 250,
  logger: LOG,
  queryCache: new ogi.FileSystemCache(QUERY_CACHE_DIR),
  storers: [inMemoryStorer, new ogi.FileSystemStorer(BILLS_DIR)]
});

importer.start(function () {
  var bills = inMemoryStorer.getBills().length;
  var errors = inMemoryStorer.getBillsInError().length;

  LOG.info("Status: " + bills + " bills succeed, " + errors + " in error.");

  lastPage += 4;

  fs.writeFileSync(lastPageFile, lastPage);
});
