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
  lastModified: '2014-03-27T03:00:00.000Z',
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

People have an indirect relationship with committees through the committee name.
The name attribute can be used to link a single person with a bill through the
list of bill subscribers.

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

Votes are imported from [PDF documents
generated](http://www.hcdn.gob.ar/secadmin/ds_electronicos/actas_votacion-
portada.html) after each Congress session.

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

### Events

Events are meetings scheduled in the public agenda. This importer retrieves
information about these events and the outcome of each meeting.

```
{
  date: "2015-04-29T03:00:00.000Z",
  event: {
    date: "2015-04-29T03:00:00.000Z",
    hour: "09:30",
    location: "Sala 1 (227/229) - Reunión Conjunta",
    committees: [
      "LEGISLACION GENERAL",
      "LEGISLACION DEL TRABAJO",
      "PRESUPUESTO Y HACIENDA"
    ],
    topic: "Trabajador Guardavidas y Timonel.",
    summary: "Régimen para el ejercicio del trabajador guardavidas y timonel. Marco regulatorio de presupuestos mínimos de guardavidas y del ambiente acuático; creación del Registro Nacional."
  },
  committees: [
    "TURISMO"
  ],
  actions: [{
    id: "3",
    name: "ANÁLISIS DE PROYECTOS DE COMPETENCIA MIXTA",
    items: [{
      summary: "LEY (0067-S-2014) INSTITUIR EL 20 DE DICIEMBRE DE CADA AÑO COMO EL DIA NACIONAL DEL TURISMO SOCIAL.",
        files: [
          "0067-S-2014"
        ],
        result: "Aprobado por unanimidad en la parte de su competencia sin modificaciones"
     }]
  }]
}
```
