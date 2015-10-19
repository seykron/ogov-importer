var fs = require("fs");
var path = require("path");
var ogi = require("./index");
var currentImporter = process.argv[2];
var debug = require("debug")("importer");

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
  },
  "events": {
    Klass: ogi.EventsImporter,
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
var storers = [
  inMemoryStorer,
  new ogi.FileSystemStorer(DATA_DIR)
];
var options = {
  startPage: 0,
  poolSize: 4,
  pageSize: 1000,
  role: currentImporter,
  persistenceFile: path.join(DATA_DIR, "pool.json"),
  resume: fs.existsSync(path.join(DATA_DIR, "pool.json")),
  queryCache: new ogi.FileSystemCache(QUERY_CACHE_DIR),
  encoding: "latin1"
};
var context = new ogi.ImporterContext(storers, options);
var importer = new Importer.Klass(context, options);

debug("Process PID: %s", process.pid);
debug("Storing data to: %s", DATA_DIR);

debug("starting import process at %s", new Date());

importer.run()
  .then(() => debug("importer finished without errors at %s", new Date()))
  .catch(err => debug("importer finished with errors: %s", err));
