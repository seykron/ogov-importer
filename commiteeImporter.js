var ogi = require("./index");

var committeeImporter = new ogi.CommitteeImporter();

committeeImporter.start(function (err, committees) {
  console.log(committees);
});
