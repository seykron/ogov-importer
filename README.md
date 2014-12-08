ogov-importer
=============

Argentina's Congress data importer. The following data can be imported:

* Bills
* Committees
* People (legislatives and senators)
* Votes

Already imported data sets are available in [ogov-data](https://github.com/seykron/ogov-data).

## Installation

```
  npm install ogov-importer
```

## Usage

There are some available importers:

* BillImporter
* CommitteeImporter
* PeopleImporter
* VoteImporter

The configuration is the same for all importers. The following example uses a BillImporter:

```
  var ogi = require("ogov-importer");
  var inMemoryStorer = new ogi.InMemoryStorer();

  // Any importer could be used here.
  var importer = new ogi.BillImporter({
    storers: [inMemoryStorer]
  });
  importer.start(function () {
    console.log("Number of imported items: " + inMemoryStorer.getNumberOfItems());
  });
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

* FileSystemStorer: stores items in a directory of the file system, using the importer-ependant identifier.

It is possible to implement a new storer according to the following interface:

```
function CustomStorer {
  return {
    /** Stores the specified item with this storer.
     *
     * @param {String} id Unique identifier for this element. Cannot be null or
     *    empty.
     * @param {Object} data Item to store. Cannot be null.
     * @param {Function} callback Callback invoked when the item is already
     *    saved. Cannot be null.
     */
    store: function (id, data, callback) {
      console.log("STORE: [" + id + "]" + JSON.stringify(data));
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

    /** Determines whether the specified key exists in the cache.
     *
     * @param {String} key Key of the entry to verify. Cannot be null or empty.
     * @param {Function} callback Receives an error and a boolean indicating
     *    whether the entry exists in the cache. Cannot be null.
     */
    exists: function (key, callback) {
      callback(null, cache.hasOwnProperty(key));
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

### Built-in script to run importers

If you just want to run importers without caring about coding, it is possible to clone this repository and run the importer script:

```
  $ git clone https://github.com/seykron/ogov-importer/
  $ cd ogov-importer
  $ npm install
  $ node importer
    Importer not specified. Supported importers are:
     bills
     committees
     people
```

This built-in importer stores all data in the ```data``` directory.

## Data format

### Bill

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
  textUrl: "http://www1.hcdn.gov.ar/proyectos_search/proyectosd.asp?whichpage=1&soloExpDip=&fromForm=1&chkFirmantes=on&chkComisiones=on&chkDictamenes=on&chkTramite=on&proy_expsen=2341-S-2006",
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
    result: 'APROBADO',
    url: "realted url, if any"
  }],
  committees: ['PRESUPUESTO Y HACIENDA', 'ENERGIA Y COMBUSTIBLES'],
  subscribers: [{
    name: 'FULL NAME',
    party: 'POLITICAL PARTY NAME',
    province: 'BUENOS AIRES'
  }]
}
```

### Committee

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
  phones: 'Of. Administrativa: (054-11) 4127-7100  interno:(2447/2448/2461)',
  members: [{
    name: "PORTELA, AGUSTIN ALBERTO",
    position: "presidente",
    district: "CORRIENTES",
    block: "UCR"
  }]
}
```

### People

People have an indirect relationship with committees through the committee name. The name attribute can be used to link a single person with a bill through the list of bill subscribers.

```
{
  pictureUrl: 'http://www4.hcdn.gob.ar/fotos/laguilar_medium.jpg',
  name: 'AGUILAR, LINO WALTER',
  user: 'laguilar',
  email: 'laguilar@diputados.gob.ar',
  district: 'SAN LUIS',
  start: '10/12/2011',
  end: '09/12/2015',
  party: 'COMPROMISO FEDERAL',
  committees: [{
    name: 'CULTURA',
    position: 'vocal'
  }]
}
```

### Votes

Votes are imported from [PDF documents generated](http://www.hcdn.gob.ar/secadmin/ds_electronicos/actas_votacion-portada.html) in each Congress session.

```
{
  description: 'Document description',
  url: "http://www1.hcdn.gov.ar/ID_PARLAMENTARIO.pdf",
  file: 'ID-PARLAMENTARIO',
  orderPaper: 'id of order paper',
  version: '1',
  date: '10/12/2011',
  hour: '18:44',
  summary: {
    majorityBase: "Votos Emitidos",
    majorityType: "La mitad más uno",
    quorum: "Más de la mitad",
    present: {
      identified: "223",
      unknown: "0",
      total: "223"
    },
    absent: "34",
    affirmative: {
      members: "217",
      president: "0",
      castingVote: "0",
      total: "217"
    },
    negative: {
      members: "0",
      president: "0",
      castingVote: "0",
      total: "0"
    },
    abstention: {
      members: "5",
      president: "0",
      total: "5"
    }
  },
  votes: [{
    name: 'LEGISLATIVE, name',
    party: 'Political Party',
    province: 'Legislative province',
    vote: 'AFIRMATIVO|ABSTENCION|NEGATIVO|AUSENTE'
  }],
  references: {
    summary: "Votación en General y Particular de los siguientes Proyectos de Ley: Expedientes 2005-D-11, 124-S-12, 3561-D-12, 127-S-12,4929-D-12, 103-S-11, 1964-D-11, 5219-D-11, 2676-D-12.",
    files: [ '2005-D-2011',
      '0124-S-2012',
      '3561-D-2012',
      '0127-S-2012',
      '4929-D-2012',
      '0103-S-2011',
      '1964-D-2011',
      '5219-D-2011',
      '2676-D-2012'
    ]
  }
}
```
