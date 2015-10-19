var debug = require("debug")("history_test");

var ogi = require("../index");

var newBill = { type: 'PROYECTO DE DECLARACION', source: 'Senado', file: '1698-S-2015', publishedOn: 'Diario de Asuntos Entrados nº 85', creationTime: '2015-05-20T03:00:00.000Z', lastModified: '2015-05-19T03:00:00.000Z', summary: 'DECLARAR DE INTERES SOCIAL Y EDUCATIVO EL LIBRO "CUERPXS EQUIVOCADXS, HACIA LA COMPRENSION DE LA DIVERSIDAD SEXUAL", DE AUTORIA DEL DOCTOR ADRIAN HELIEN Y LA LICENCIADA ALBA PIOTTO.', textUrl: 'http://www.senado.gov.ar/web/proyectos/verExpe.php?origen=S&nro_comision=&tipo=PD&numexp=1698/15&tConsulta=3', subscribers: [ { name: 'ODARDA, MARIA MAGDALENA', party: 'FRENTE PROGRESISTA - CCARI', province: 'RIO NEGRO' } ], committees: [ 'EDUCACION Y CULTURA' ], dictums: [ { source: 'Senado', orderPaper: 'MOCION SOBRE TABLAS (AFIRMATIVA)', date: '2015-05-27T03:00:00.000Z', result: null }, { source: 'Senado', orderPaper: 'CONSIDERACION Y APROBACION', date: '2015-05-27T03:00:00.000Z', result: 'APROBADO' } ], procedures: [] };

var history = new ogi.BillHistory(__dirname + "/../data/bills/all2.json", {
  from: Date.parse("2015-01-01")
});
history.load()
  .then(() => {
    debug("json loaded. Index size: %s KB", history.size() / 1024);
    history.push(newBill)
      .then(() => history.close())
      .catch(err => {
        debug("error: %s", err);
        history.close()
      });
  })
  .catch(err => debug(err));
