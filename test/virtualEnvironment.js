process.env.DEBUG = (process.env.DEBUG || "") +
  " virtual_environment virtual_environment_test";

var Promise = require("promise/setimmediate");
var debug = require("debug")("virtual_environment_test");
var fs = require("fs");
var rmdir = require("rmdir");
var VirtualEnvironment = require("../lib/VirtualEnvironment");
var FileSystemCache = require("../lib/FileSystemCache");

var CACHE_DIR = __dirname + "/cache";

var removeCacheDir = function () {
  return new Promise(function (resolve, reject) {
    if (fs.existsSync(CACHE_DIR)) {
      rmdir(CACHE_DIR, function (err) {
        if (err)
          reject(err);
        else
          resolve();
      });
    } else {
      resolve();
    }
  });
};

var createCacheDir = function () {
  return new Promise(function (resolve, reject) {
    removeCacheDir().then(function () {
      fs.mkdirSync(CACHE_DIR);
      resolve();
    }, reject)
  });
};

var createEnv = function () {
  return new Promise(function (resolve, reject) {
    var queryCache = new FileSystemCache(CACHE_DIR);
    var env = new VirtualEnvironment({
      queryCache: queryCache
    });

    env.load("https://www.github.com").then(function ($) {
      resolve($);
    }, reject);
  });
};

(function __initialize() {
  createCacheDir().then(function () {
    debug("creating environment from network");

    createEnv().then(function ($) {
      debug("data received: %s", $("span:first-child").errorIfEmpty());
      debug("data received: %s", $("span:first-child").defaultIfEmpty("Foo"));
      debug("creating environment from cache");
      createEnv().then(function ($) {
        debug("data received: %s", $("span:first-child").trim());
        removeCacheDir();
      });
    }).catch(function (err) {
      debug("error: %s", err);
    });
  }).catch(function (err) {
    debug("error: %s", err);
    removeCacheDir();
  });
}());

