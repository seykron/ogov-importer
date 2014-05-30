var fs = require("fs");
var path = require("path");
var ogi = require("./index");
var currentImporter = process.argv[2];

var IMPORTERS = {
  "bills": ogi.BillImporter,
  "committees": ogi.CommitteeImporter,
  "people": ogi.PeopleImporter,
  "vote": ogi.VoteImporter
};
var Importer = IMPORTERS[currentImporter];

if (!Importer) {
  if (currentImporter) {
    console.log("Importer '" + currentImporter + "' does not exist. " +
      "Supported importers are:");
  } else {
    console.log("Importer not specified. Supported importers are:");
  }

  for (var property in IMPORTERS) {
    console.log("   " + property);
  }
  return;
}

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
  var dataDir = path.join(__dirname, "data");
  var cache = path.join(__dirname, "data", "cache");

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }
  if (!fs.existsSync(cache)) {
    fs.mkdirSync(cache);
  }
  return cache;
}());

var DATA_DIR = (function () {
  var dataDir = path.join(__dirname, "data", currentImporter);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }
  return dataDir;
}());

var inMemoryStorer = new ogi.InMemoryStorer();
var importer = new Importer({
  poolSize: 4,
  pageSize: 250,
  logger: LOG,
  queryCache: new ogi.FileSystemCache(QUERY_CACHE_DIR),
  storers: [inMemoryStorer, new ogi.FileSystemStorer(DATA_DIR)]
});

LOG.info("Storing data to: " + DATA_DIR);

importer.start(function () {
  console.log("Imported items: " + inMemoryStorer.getItems().length);
});
