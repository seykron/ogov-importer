ogov-importer
=============

Argentina's Congress data importer. There following data can be imported:

* Bills

* Committees

## Installation

```
  npm install ogov-importer
```

## Bill importer

Import bills and store them in memory.

```
  var ogi = require("ogov-importer");
  var inMemoryStorer = new ogi.InMemoryStorer();

  var importer = new ogi.BillImporter({
    storers: [inMemoryStorer]
  });
  importer.start(function () {
    var bills = inMemoryStorer.getBills().length;
    var errors = inMemoryStorer.getBillsInError().length;

    console.log("Status: " + bills + " bills succeed, " + errors + " in error.");
  });
```

### Supported parameters

* *lastPage*: page to resume a previous import process.

* *queryCache*: cache implementation to store raw HTML result.

* *storers*: list of storers to store bills in different data sources.

* *logger*: winston logger instance.

* *poolSize*: size of concurrent pages to process at the same time.

* *pageSize*: number of bills to retrieve in each page. Maximum and default is
  1000.

### Storers

The importer supports storers. A storer is an interface that allows to store bills in different data sources and it is designed to provide contention to the import process. There're two built-in storers:

* InMemoryStorer: stores bills in a memory map.

* FileSystemStorer: stores bills in a directory of the file system, using the
bill identifier as file name.

It is possible to implement a new storer according to the following interface:

```
function CustomStorer {
  return {
    /** Stores the specified bill with this storer.
     *
     * @param {Object} billData Bill to store. Cannot be null.
     * @param {Function} callback Callback invoked when the bill is already
     *    saved. Cannot be null.
     */
    store: function (billData, callback) {
      console.log("STORE: " + JSON.stringify(billData));
      callback();
    },

    /** Waits until all operations in the storer has finished.
     *
     * @param {Function} callback Invoked when there is no pending operations.
     *    Cannot be null.
     */
    wait: function (callback) {
      // No async operations pending.
      callback();
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

    /** Waits until all operations in the cache has finished.
     *
     * @param {Function} callback Invoked when there is no pending operations.
     *    Cannot be null.
     */
    wait: function (callback) {
      // No async operations pending.
      callback();
    }
  };
}
```

### Bill format

Bills contain the following normative elements:

* [Procedures](https://en.wikipedia.org/wiki/Parliamentary_procedure)

* [Dictums](https://en.wikipedia.org/wiki/Dictum)

* [Committees](https://en.wikipedia.org/wiki/Committee)

* Subscribers

Bills are represented by the following JSON structure:

```
{
  type: 'PROYECTO DE LEY|PROYECTO DE RESOLUCION|PROYECTO DE DECLARACION|ETC',
  source: 'Diputados|Senado',
  file: 'ID-PARLAMENTARIO',
  publishedOn: 'Diario de Asuntos Entrados N° 5',
  creationTime: '2014-03-27T03:00:00.000Z',
  summary: 'Resumen del proyecto',
  revisionChamber: 'Diputados|Senado',
  revisionFile: 'ID-PARLAMENTARIO',
  procedures: [{
    file: 'ID-PARLAMENTARIO',
    source: 'Diputados|Senado',
    topic: 'Consideración y Aprobación',
    date: '2014-03-27T03:00:00.000Z',
    result: 'MEDIA SANCIÓN'
  }],
  dictums: [{
    file: 'ID-PARLAMENTARIO',
    source: 'Diputados|Senado',
    orderPaper: 'MOCION SOBRE TABLAS (AFIRMATIVA)',
    date: '2014-03-27T03:00:00.000Z',
    result: 'APROBADO'
  }],
  committees: ['PRESUPUESTO Y HACIENDA', 'ENERGIA Y COMBUSTIBLES'],
  subscribers: [{
    name: 'FULL NAME',
    party: 'POLITICAL PARTY NAME',
    province: 'BUENOS AIRES'
  }]
}
```

## Committees importer

Import committees:

```
  var ogi = require("./index");
  var committeeImporter = new ogi.CommitteeImporter();

  committeeImporter.start(function (err, committees) {
    if (err) {
      throw err;
    }
    console.log(committees);
  });
```

### Committee format

Committees have a relationship with bills through the name.

```
{
  name: 'DISCAPACIDAD',
  url: 'http://www.hcdn.gob.ar/comisiones/permanentes/cdiscap/',
  type: 'permanentes',
  location: 'Riobamba 25 Piso 4° Oficina 455, CP C1025ABA , C.A.B.A.',
  secretary: 'LIC. BARROS, ADOLFO',
  chief: 'SRA.GOMEZ,MARTA M.',
  meetings: 'Miercoles 10:00 Hs.',
  phones: 'Of. Administrativa: (054-11) 4127-7100  interno:(2447/2448/2461)'
}
```
