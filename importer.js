const DEBUG = "importer,runner,history,bill_importer,committee_importer," +
  "people_importer";

if (process.env.DEBUG) {
  process.env.DEBUG += "," + DEBUG;
} else {
  process.env.DEBUG = DEBUG;
}

var fs = require("fs");
var debug = require("debug")("importer");
var args = require("./app/arguments")(process.argv);
var config = JSON.parse(fs.readFileSync("config.json").toString());
var runner = require("./app/runner")(config, args);

debug("starting import process at %s", new Date());
runner.run()
  .then(() => debug("importer finished without errors at %s", new Date()))
  .catch(err => debug("importer finished with errors: %s", err.stack));
