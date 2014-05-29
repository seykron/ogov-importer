var fs = require("fs");
var filePath = __dirname + '/132OE04_01_R06.pdf';

var extract = require('pdf-text-extract')
var voteExpr = /([\w-,\s])+(AFIRMATIVO|ABSTENCION|NEGATIVO|AUSENTE)/;

extract(filePath, {
  "-layout": ""
}, function (err, pages) {
  if (err) {
    console.dir(err)
    return
  }
  pages.toString().split("\n").forEach(function (line) {
    if (voteExpr.test(line)) {
      var info = line.split(/\s{2,}/);
      if (!info[0]) {
        console.log({
          name: info[1],
          party: info[2],
          province: info[3],
          vote: info[4]
        });
      }
    }
  });
  fs.writeFileSync(__dirname + "/output.txt", pages);
});
