/** An asynchronous pool backed by a FIFO priority queue that persists the state
 * in the file system. New items are enqueued and sorted according to the
 * specified priority, then they are taken from the queue head into the pool.
 *
 * @param {String} [options.persistenceFile] Full path to the file to save the
 *    queue state.
 */
module.exports = function ImporterPool(options) {

  /** Current import instance. */
  var importerPool = this;

  /** Utility to extend objects.
   * @type {Function}
   */
  var extend = require("extend");

  /** Default configuration extended by the provided options.
   * @type {Object}
   */
  var config = extend({
    persistenceFile: options && options.persistenceFile,
    poolSize: options && options.poolSize || 2,
    defaultPriority: options && options.defaultPriority || 100
  }, options);

  /** Node's FileSystem API.
   * @type {Object}
   */
  var fs = require("fs");

  /** Default logger.
   * @type {Function}
   */
  var debug = require("debug")("importer_pool");

  /** Node events handler.
   * @type {Function}
   */
  var EventEmitter = require("events").EventEmitter;

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Indicates whether the pool is paused.
   * @type {Boolean}
   */
  var paused = false;

  /** Indicates whether there're no more items in the queue and items
   * processing finished.
   * @type {Boolean}
   */
  var idle = true;

  /** Contains the queue items.
   * @type {Object[]}
   */
  var queue = [];

  /** Processes a single task.
   * @param {Object} task Task to process. Cannot be null.
   * @return {Promise<Task,Error>} a promise to the executed task, never null.
   */
  var enqueue = function (task) {
    return new Promise((resolve, reject) => {
      var error = err => {
        importerPool.emit("error", err, task.data);
        reject(err);
      };

      debug("executing task: %s", JSON.stringify(task));

      importerPool.emit("execute", task.data, () => resolve(task), error);

      if (task.role) {
        importerPool.emit(task.role, task.data, () => resolve(task), error);
      }
    });
  };

  /** Processes the pool and waits for tasks when it reaches the max if
   * configured concurrency.
   * @param {Function} slotEmpty Callback invoked when a single task finished.
   *    Cannot be null.
   */
  var process = function* (slotEmpty) {
    var concurrency = 0;

    while (!paused) {
      if (concurrency == config.poolSize ||
          queue.length === 0) {
        yield concurrency;
      }

      enqueue(queue.shift())
        .then(task => {
          debug("task finished without errors: %s", JSON.stringify(task));
          concurrency -= 1
          slotEmpty(concurrency);
        })
        .catch(err => {
          debug("task finished in error. Error: %s", err);
          concurrency -= 1
          slotEmpty(concurrency);
        });

      concurrency += 1;
    }
  };

  /** Main pool worker, it waits for empty slots and notifies via event when
   * the queue is empty.
   */
  var worker = process((concurrency) => {
    if (paused) {
      debug("pool paused, stop processing")
      return;
    }

    idle = concurrency === 0 && queue.length === 0;

    if (idle) {
      debug("queue empty, adding more items");
      importerPool.emit("drain");
    } else if (queue.length > 0) {
      worker.next();
    } else {
      debug("queue empty, no more items in the queue, going idle");
    }
  });

  return extend(importerPool, new EventEmitter(), {

    /** Adds an item to the queue.
     * @param {Object} item Item to add. Cannot be null.
     * @param {Number} [priority] Item priority. Default is 100.
     * @param {String} [role] Item role, it is triggered as event when an item
     *    with this role is processed.
     */
    push (item, priority, role) {
      debug("pushing item to the pool: %s", JSON.stringify(item));

      queue.push({
        data: item,
        priority: priority || config.defaultPriority,
        role: role
      });

      queue.sort((item1, item2) => item1.priority > item2.priority ? -1 : 1 )

      // If the queue is empty and the pool is idle, it forces the pool to
      // process the new item.
      if (queue.length === 1) {
        // Let the event loop to finish the calling stack, so we can safely
        // check whether the pool is idle. It is to avoid a race condition if
        // the item is added from inside a pool event.
        setImmediate(() => {
          if (idle) {
            worker.next();
          }
        });
      }
    },

    /** Returns the queue size.
     * @return {Number} the queue size, never null.
     */
    size () {
      return queue.length;
    },

    /** Saves the queue state to the persistence file.
     * @return {Promise} a promise, never null.
     */
    save () {
      return new Promise((resolve, reject) => {
        if (!config.persistenceFile) {
          return resolve();
        }
        debug("writing state to file %s", config.persistenceFile);

        fs.writeFileSync(config.persistenceFile, JSON.stringify(queue));
        resolve();
      });
    },

    /** Retores the queue from the persistence file. It replaces the current
     * queue state.
     * @return {Promise} a promise, never null.
     */
    restore () {
      return new Promise((resolve, reject) => {
        if (!config.persistenceFile) {
          return resolve();
        }
        fs.readFile(config.persistenceFile, (err, buffer) => {
          if (err) {
            return reject(err);
          }

          debug("restoring state from file %s", config.persistenceFile);
          queue = JSON.parse(buffer.toString());

          resolve();
        });
      });
    },

    /** Pauses the pool. */
    pause () {
      debug("pausing pool");
      paused = true;
    },

    /** Resumes the pool processing. */
    resume () {
      debug("resuming pool");
      paused = false;
      worker.next();
    }
  });
};
