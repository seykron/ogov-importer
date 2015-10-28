ogov-importer
=============

Argentina's Congress data importer. It imports the following data:

* Bills
* Committees
* People (legislatives and senators)
* Votes
* Events

Datasets are available in [ogov-data](https://github.com/seykron/ogov-data)
project.

The data format is described in the [model documentation](docs/model.md). In
order to understand how importers work, look at the [crawler
documentation](docs/crawler.md).

## Installation

```
  npm install -g ogov-importer
```

## Usage

Importer data is stored into the *data* directory created in current working
directory.

Formal command line parameters:

```
$ ogov-importer bills|committees|people|votes|events
  [--historyEnabled=true] [--cacheEnabled=false] [--start=1999] [--end=2015]
  [--pageSize=1000] [--poolSize=4] [--startPage=0]
```

Import bills:

```
$ ogov-importer bills
```

Import committees:

```
$ ogov-importer committees
```

Import people:

```
$ ogov-importer people
```

Import votes:

```
$ ogov-importer votes
```

Import events:

```
$ ogov-importer events
```

It is possible to run multiple importers at the same time:

```
$ ogov-importer committees people votes
```

## Parameters

The following parameters are supported by all importers:

**--historyEnabled=[true|false]**. Default is true. Enables the history to
generate a delta file with changes since the previous execution. It causes the
history to read the previous dataset file.

**--cacheEnabled=[true|false]**. Default is false. When enabled, all data is
read from the file system cache if available. **It is intented for debugging
purposes**.

The bill importer supports the following additional parameters:

**--start=YEAR**. Default is 1999. Year to start importing bills from.

**--end=YEAR**. Default is the current year. Year to end importing bills.

**--startPage=NUMBER**. Default is 0. 0-based page to start importing data. The
number of pages depends on the *pageSize* parameter. **It is intented for
debugging purposes**.

**--pageSize=NUMBER**. Default is 1000. How many bills will retrieve in a single
result page. **It is intented for debugging purposes**.
