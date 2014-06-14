var fs = require("fs");
var path = require("path");
var ogi = require("./index");
var currentImporter = process.argv[2];

var IMPORTERS = {
  "bills": {
    Klass: ogi.BillImporter,
    storerOptions: {
      deph: 2
    }
  },
  "committees": {
    Klass: ogi.CommitteeImporter,
    storerOptions: {
      deph: 0
    }
  },
  "people": {
    Klass: ogi.PeopleImporter,
    storerOptions: {
      deph: 0
    }
  },
  "vote": {
    Klass: ogi.VoteImporter,
    storerOptions: {
      deph: 0
    }
  }
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
var importer = new Importer.Klass({
  startPage: 0,
  poolSize: 4,
  pageSize: 1000,
  logger: LOG,
  role: currentImporter,
  queryCache: new ogi.FileSystemCache(QUERY_CACHE_DIR),
  storers: [
    inMemoryStorer,
    new ogi.FileSystemStorer(DATA_DIR, Importer.storerOptions)
  ]
});

LOG.info("Process PID: " + process.pid);
LOG.info("Storing data to: " + DATA_DIR);

importer.start(function () {
  console.log("Imported items: " + inMemoryStorer.getItems().length);
});
