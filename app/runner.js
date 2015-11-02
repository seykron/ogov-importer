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

  /** Available data providers that can be specified by configuration on each
   * importer.
   */
  var DataProviders = {
    json: ogi.JsonFileDataProvider,
    mysql: ogi.MySqlDataProvider
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

  /** Setups the history for the specified command, if enabled.
   * @param {Object} command Command to setup history for. Cannot be null.
   */
  var setupHistory = function (command) {
    return new Promise((resolve, reject) => {
      var historyStorer;
      var historyDataSource = command.dataDir &&
        resolveHistoryDataSource(command.dataDir);
      var historyFile = resolveDataFileName(command.dataDir,
        command.name, "delta");
      var history;
      var historyEnabled = (!args.hasOwnProperty("historyEnabled") ||
        args.historyEnabled === true) && historyDataSource;

      // History is enabled by default and only when there exist a previous
      // bundle file.
      if (historyEnabled) {
        debug("using history storer with data source %s and output file %s",
          historyDataSource, historyFile);

        historyStorer = new ogi.FileSystemStorer(historyFile);
        history = new ogi.History(historyDataSource, historyStorer, command,
          command.config.history);
        command.context.addStorer(history);
        resolve(history.load());
      } else {
        debug("no history enabled");
        resolve();
      }
    });
  };

  /** Validates a that specified command(s) are supported.
   * @param {String} commands Either a command name, or a comma-separated names,
   *    or array of command names. Cannot be null.
   */
  var validateCommands = function (commands) {
    var resolvedCommands = commands;

    if (typeof commands === "string") {
      resolvedCommands = [commands.split(",")];
    }
    resolvedCommands.forEach(commandName => {
      if (!Commands.hasOwnProperty(commandName)) {
        return reject(new Error("Command not found: " + commandName));
      }
    });

    return resolvedCommands;
  };

  /** Creates and loads the data providers specified in the provided command
   * configuration.
   * @param {Object} commandConfig Command configuration which has data
   *    providers information. Cannot be null.
   */
  var createTransformer = function (commandConfig) {
    return new Promise((resolve, reject) => {
      var transformerInfo = commandConfig.transformer;
      var transformer;
      var dataProviders;

      if (!transformerInfo) {
        debug("no transformer for command");
        return resolve();
      }

      debug("initializing data providers");

      dataProviders = Object.keys(transformerInfo.dataProviders).map(key => {
        if (DataProviders.hasOwnProperty(key)) {
          return new DataProviders[key](transformerInfo.dataProviders[key]);
        } else {
          debug("unsupported data provider: %s", key);
          return null;
        }
      }).filter(dataProvider => dataProvider !== null);

      debug("creating transformer");

      transformer = new ogi.Transformer(dataProviders,
        transformerInfo.key, transformerInfo.map);
      resolve(transformer.load().then(() => transformer));
    });
  };

  var createStorers = function (commandName, commandConfig, transformer) {
    var dataDir, dataFile;

    if (config.createStorers) {
      return config.createStorers(commandName, commandConfig, transformer);
    }

    dataDir = path.normalize(commandConfig.dataDir);
    dataFile = resolveDataFileName(dataDir, commandName);
    debug("writing data to: %s", dataFile);

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }

    return [new ogi.FileSystemStorer(dataFile, transformer)];
  };

  var createCommand = function (commandName, commandConfig) {
    return new Promise((resolve, reject) => {
      debug("creating command");

      resolve(createTransformer(commandConfig).then((transformer) => {
        debug(transformer);
        var storers = createStorers(commandName, commandConfig, transformer);
        var context = new ogi.ImporterContext(storers, commandConfig);
        var CommandClass = Commands[commandName];
        var command = Object.assign(new CommandClass(context, commandConfig), {
          context: context,
          transformer: transformer,
          config: commandConfig,
          dataDir: commandConfig.dataDir &&
            path.normalize(commandConfig.dataDir)
        });

        return setupHistory(command).then(() => command);
      }));
    });
  };

  var run = function (commandName) {
    return new Promise((resolve, reject) => {
      var commandConfig = Object.assign({}, config,
        config.importers[commandName], args);

      resolve(createCommand(commandName, commandConfig).then(command => {
        debug("starting command at %s", new Date());
        debug("running command '%s' with config %s", commandName,
          JSON.stringify(commandConfig));

        return command.run()
          .then(() => command.transformer && command.transformer.close());
      }));
    });
  };

  (function __initialize() {
    var cacheEnabled = args.hasOwnProperty("cacheEnabled") && args.cacheEnabled;

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
  }());

  return {
    run (commands) {
      return new Promise((resolve, reject) => {
        var resolvedCommands = validateCommands(commands || args.commands);

        debug("preparing commands: %s", resolvedCommands);

        async.each(resolvedCommands,
          (command, next) => run(command).nodeify(next),
          (err) => {
            if (err) {
              debug("command finished with errors: %s", err);
              reject(err);
            } else {
              debug("command finished without errors at %s", new Date());
              resolve();
            }
          });
      });
    }
  };
};
