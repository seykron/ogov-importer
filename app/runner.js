module.exports = function (options, args) {

  /** A date, in milliseconds. */
  const DAY_MILLIS = 60 * 60 * 30 * 1000;

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Default logger. */
  var debug = require("debug")("runner");

  /** Node's file system API. */
  var fs = require("fs");

  /** Node's Path API. */
  var path = require("path");

  /** Importer library. */
  var ogi = require("../");

  /** Async flow library. */
  var async = require("async");

  /** Default configuration. */
  var config = Object.assign({
    queryCache: new ogi.FileSystemCache(options.cacheDir)
  }, options, args);

  var Commands = {
    bills: ogi.BillImporter,
    committees: ogi.CommitteeImporter,
    people: ogi.PeopleImporter,
    votes: ogi.VoteImporter,
    events: ogi.EventsImporter
  };

  /** Search for a bundle file in the specified directory to use it as the
   * history data source. It only takes into account bundle files older than
   * a day (24 hours).
   * @param {String} dataDir Directory to search for data sources. Cannot be
   *    null or empty.
   */
  var resolveHistoryDataSource = function (dataDir) {
    var bundleFile = fs.readdirSync(dataDir)
      .sort()
      .filter(file => {
        var group = file.match(/(\d+-\d+-\d+)-\w+\.json/);
        // Only takes into account data sources older than a day.
        return group && (Date.now() - Date.parse(group.pop()) > DAY_MILLIS);
      })
      .pop();

    if (bundleFile)
      return path.normalize(dataDir + "/" + bundleFile);
    else
      return null;
  };

  /** Creates the bundle file name. Bundle files has the import date as prefix
   * in the format yyyy-mm-dd.
   *
   * @param {String} dataDir Directory to store the file. Cannot be null or
   *    empty.
   * @param {String} baseName Base name of the bundle file. Cannot be null.
   * @param {String} [suffix] Suffix to append after the base name.
   */
  var resolveDataFileName = function (dataDir, baseName, suffix) {
    var now = new Date();
    var year = now.getFullYear();
    var month = (now.getMonth() + 1).toString();
    var date = now.getDate().toString();
    var timestamp;

    if (month.length === 1) {
      month = "0" + month;
    }
    if (date.length === 1) {
      date = "0" + date;
    }

    timestamp = year + "-" + month + "-" + date;

    if (suffix)
      return path.normalize(dataDir + "/" +
        timestamp + "-" + baseName + "-" + suffix + ".json");
    else
      return path.normalize(dataDir +
        timestamp + "-" + baseName + ".json");
  };

  var useHistoryIfRequired = function (context, command, commandName,
      commandConfig) {
    return new Promise((resolve, reject) => {
      var historyStorer;
      var historyDataSource = resolveHistoryDataSource(commandConfig.dataDir);
      var historyFile = resolveDataFileName(commandConfig.dataDir,
        commandName, "delta");
      var history;
      var historyEnabled = (!args.has("historyEnabled") ||
        args.historyEnabled === "true") && historyDataSource;

      // History is enabled by default and only when there exist a previous
      // bundle file.
      if (historyEnabled) {
        debug("using history storer with data source %s and output file %s",
          historyDataSource, historyFile);

        historyStorer = new ogi.FileSystemStorer(historyFile);
        history = new ogi.History(historyDataSource, historyStorer, command,
          commandConfig.history);
        context.addStorer(history);
        resolve(history.load());
      } else {
        debug("no history enabled");
        resolve();
      }
    });
  };

  (function __initialize() {
    var cacheEnabled = args.has("cacheEnabled") && args.cacheEnabled;

    debug("process PID: %s", process.pid);
    debug("process args: %s", JSON.stringify(args));
    debug("initializing config: %s", JSON.stringify(config));

    if (cacheEnabled) {
      debug("using cache, writing entries to: %s", config.cacheDir);

      if (!fs.existsSync(config.cacheDir)) {
        fs.mkdirSync(config.cacheDir);
      }
    } else {
      debug("cache disabled");
    }
    args.commands.forEach(commandName => {
      if (!Commands.hasOwnProperty(commandName)) {
        return reject(new Error("Command not found: " + commandName));
      }
    });
  }());

  return {
    run () {
      return new Promise((resolve, reject) => {
        async.each(args.commands, (commandName, next) => {
          var commandConfig = config.importers[commandName];
          var configWithArgs = Object.assign({}, config, commandConfig, args);
          var dataDir = path.normalize(commandConfig.dataDir);
          var dataFile = resolveDataFileName(dataDir, commandName);
          var context = new ogi.ImporterContext([
            new ogi.FileSystemStorer(dataFile)
          ], configWithArgs);
          var command = Commands[commandName](context, configWithArgs);

          if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir);
          }

          debug("starting command at %s", new Date());
          debug("writing data to: %s", dataFile);
          debug("running command '%s' with config %s", commandName,
            JSON.stringify(commandConfig));

          useHistoryIfRequired(context, command, commandName, commandConfig)
            .then(() => command.run())
            .then(() => {
              debug("command finished without errors at %s", new Date());
              next();
            })
            .catch(err => next(err));
        }, err => {
          if (err)
            reject(err);
          else
            resolve();
        });
      });
    }
  };
};
