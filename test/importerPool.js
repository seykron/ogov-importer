process.env.DEBUG = (process.env.DEBUG || "") +
  " importer_pool importer_pool_test";

var debug = require("debug")("importer_pool_test");
var fs = require("fs");
var ImporterPool = require("../lib/ImporterPool");

var pool;

var saveAndContinue = function () {
  pool.save().then(function () {
    initPool();
    pool.restore().then(() => pool.resume())
  });
};

var initPool = function () {
  pool = new ImporterPool({
    poolSize: 3,
    persistenceFile: __dirname + "/testQueue.json"
  });

  pool.on("execute", function (item, resolved, reject) {
    debug("processing %s", item);

    // Forces queueing until "two".
    if (item === "four") {
      pool.pause();
      saveAndContinue();
      resolved();
    } else if (item === "one") {
      reject(new Error("Test error"));
    } else {
      resolved();
    }
  });
  pool.on("drain", function () {
    var queueFile = __dirname + "/testQueue.json";
    debug("items successfully processed.");

    if (fs.existsSync(queueFile)) {
      fs.unlinkSync(queueFile);
    }
  });
  pool.on("error", function (err, item) {
    debug("error processing item %s", item);
    pool.push(item + "-recovered");
  });
};

(function __initialize() {
  initPool();

  ["one", "two", "three", "four", "five"].forEach(function (item, index) {
    pool.push(item, 100 - 5 + index);
  });
}());
