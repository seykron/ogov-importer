# Nightcrawler

WARNING: incomplete/out of date documentation.

The configuration is the same for all importers. The following example runs a
BillImporter:

```
  var ogi = require("ogov-importer");
  var inMemoryStorer = new ogi.InMemoryStorer();
  var context = new ogi.ImporterContext([inMemoryStorer]);

  // Any importer could be used here.
  var importer = new ogi.BillImporter(context);
  importer.run();
```

### Supported parameters

* *lastPage*: optional. Page to resume a previous import process.
* *queryCache*: optional. cache implementation to store raw HTML result.
* *storers*: required. List of storers to save imported items into different data sources.
* *logger*: optional. Winston logger instance.
* *poolSize*: optional. Size of concurrent pages to process at the same time.
* *pageSize*: optional. Number of items to retrieve by page. Maximum and default is 1000.

## Features

* Importers are idempotent
* Storers: save imported data into different data sources.
* Query cache: a cache to store full query results in order to increase performance reducing network usage.
* Task-based import process designed to provide high-level contention.
* Built-in script to run importers without coding :)

### Storers

The importer supports storers. A storer is an interface that allows to save imported items into different data sources and it is designed to provide contention to the import process. There're two built-in storers:

* InMemoryStorer: stores items in a memory map.

* FileSystemStorer: stores items in a bundle file.

It is possible to implement a new storer according to the following interface:

```
function CustomStorer {
  return {

    /** Stores the specified item with this storer.
     *
     * @param {String} id Unique identifier for this element. Cannot be null or
     *    empty.
     * @param {Object} data Item to store. Cannot be null.
     * @return {Promise<Object,Error>} Returns a promise.
     */
    store (id, data) {
      return new Promise((resolve, reject) => {
        console.log("STORE: [" + id + "]" + JSON.stringify(data));
        resolve();
      });
    },

    /** Closes and clean up this storer.
     */
    close () {
    }
  };
}
```

### Query Cache

In order to improve performance it is possible to cache full queries results. It provides another level of contention to the import process. There's a built-in ```FileSystemCache``` that stores results in a file system directory. The following example shows how to implement a memory cache (completely useless, a nice implementation could be through memcached):

```
function CustomQueryCache() {
  /**  Memory cache implementation. */
  var cache = {};

  return {

    /** Puts an entry into the cache.
     *
     * @param {Object} key Entry key. Cannot be null.
     * @param {Object} data Entry value. Cannot be null.
     * @param {Function} [callback] Invoked when the cache entry is successfully
     *    stored. It takes an error as parameter.
     */
    put: function (key, data, callback) {
      cache[JSON.stringify(key)] = data;
      callback(null);
    },

    /** Reads an entry from the cache.
     * @param {Object} key Entry key. Cannot be null.
     * @param {Function} callback Invoked to provide the entry value. It takes
     *    an error and the entry value as parameters. Cannot be null.
     */
    get: function (key, callback) {
      callback(null, cache[JSON.stringify(key)]);
    },

    /** Determines whether the specified key exists in the cache.
     *
     * @param {String} key Key of the entry to verify. Cannot be null or empty.
     * @param {Function} callback Receives an error and a boolean indicating
     *    whether the entry exists in the cache. Cannot be null.
     */
    exists: function (key, callback) {
      callback(null, cache.hasOwnProperty(key));
    }
  };
}
```

### Task-based import process

An import process consist of tasks that retrieve and parse information in parallel. Each task loads a data url into a virtual DOM environment and it can use jQuery to easily parse data. It is possible to implement new importers extending the ```Importer``` interface. The most simple implementation may look as the following example:

```
function CustomImporter() {

  /** Base class to inherit behaviour from. */
  var Importer = require("./lib/Importer")

  /** Current importer instance. */
  var importer = new Importer(options);

  /** Indicates whether the importer is already running or not. */
  var enqueued = false;

  return extend(importer, {

    /** Executes an enqueued task.
     *
     * @param {Object} task Task to execute. Cannot be null.
     * @param {String} task.name Task name. Cannot be null or empty.
     * @param {Object} data Task specific data. Can be null.
     */
    execute: function (task, callback) {
      importer.initEnv("http://[data.url]", function (errors, window) {
        // ... Parse data with window.jQuery() ...
        // ... store each item with importer.store(id, data, callback) ...

        callback();
      });
    },

    /** Enqueues a new task. Tasks will be executed as soon as the pool has
     * space for new elements.
     * @return {Object} Returns the task to enqueue, never null.
     */
    enqueueTask: function () {
      if (enqueued) {
        return null;
      } else {
        enqueued = true;
        return {
          name: "My custom task",
          data: {}
        };
      }
    }
  });
}
```
