module.exports = function (context) {

  /** Default logger. */
  var debug = require("debug")("people_importer");

  /** Url of the legislatives index.
   * @constant
   * @private
   */
  var URL = "http://www.senado-ba.gov.ar/inst_senadores.aspx";

  /** Url to get a single senator information. */
  var URL_SENATOR_INFO = "http://www.senado-ba.gov.ar/" +
    "inst_senadores_individual.aspx?idP=";

  /** Async flow control library.
   * @type Object
   * @private
   */
  var async = require("async");

  /** Promises library.
   * @type {Function}
   */
  var Promise = require("promise/setimmediate");

  /** Utilities to sanitize and operate with inputs.
   * @type {Object}
   */
  var InputUtils = require("../../InputUtils");

  var getInfoValue = function (info) {
    return info.substr(info.indexOf(":") + 1).trim();
  };

  var createRequest = function (form, pageNumber) {
    var formData = form.serializeArray().reduce((formData, field) => {
      formData[field.name] = field.value;
      return formData;
    }, {});

    return {
      method: "POST",
      headers: {
        // Must be a valid user agent, it is validated by ASP.
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/44.0.2403.61 Safari/537.36"
      },
      form: Object.assign(formData, {
        __EVENTTARGET: "ctl00$ContentPlaceHolder1$GridSenadores",
        __EVENTARGUMENT: "Page$" + pageNumber
      }),
      pageNumber: pageNumber
    };
  };

  var fetchCommittees = function (userId) {
    return new Promise((resolve, reject) => {
      context.load(URL_SENATOR_INFO + userId).then($ => {
        var committeesElements = $(".senador_tabla").eq(0).find("tbody > tr");
        var committees = [];

        committeesElements.each((index, item) => {
          var committee = $(item).find("td");
          var committeeInfo = committee.eq(0).find("a");

          committees.push({
            id: committeeInfo.attr("href").match(/id=(\d+)/).pop(),
            name: committeeInfo.errorIfEmpty(),
            position: committee.eq(1).errorIfEmpty()
          });
        });

        resolve(committees);
      }).catch(reject);
    });
  };

  var loadCommittees = function (senators, pageNumber, form) {
    return new Promise((resolve, reject) => {
      if (senators.length === 0) {
        debug("no more people");
        return resolve();
      }

      async.each(senators, (senator, next) => {
        debug("fetching information for %s", senator.name);

        fetchCommittees(senator.uid).then(committees => {
          senator.committees = committees;
          context.store(senator.user, senator).nodeify(next);
        }).catch(err => next(err));
      }, err => {
        if (err)
          reject(err);
        else {
          resolve(loadNextPage(createRequest(form, pageNumber)));
        }
      });
    });
  };

  var loadNextPage = function (request) {
    return new Promise((resolve, reject) => {
      var nextPage = (request && (request.pageNumber + 1)) || 2;

      debug("loading page %s", nextPage - 1);

      context.loadWithResponse(Object.assign({
        url: URL
      }, request)).then(result => {
        var $ = result.$;
        var senatorsElements = $(".senador");
        var senators = [];

        senatorsElements.each((index, item) => {
          var senator = $(item);
          var positionInfo = senator.find(".ulf1 > li");
          var contactInfo = senator.find(".ulf2 > li");
          var mandateTime = getInfoValue(positionInfo.eq(0).errorIfEmpty());
          var email = getInfoValue(contactInfo.eq(2).errorIfEmpty());
          var userId = senator.find("a").eq(0).attr("href").match(/idP=(\d+)/)
            .pop();

          // The last element is the starred senator, we skip it.
          if (index === senatorsElements.length - 1) {
            return;
          }

          senators.push({
            uid: userId,
            pictureUrl: senator.find("img").attr("src"),
            name: senator.find("h2").errorIfEmpty(),
            user: email.substr(0, email.indexOf("@")),
            block: getInfoValue(positionInfo.eq(1).errorIfEmpty()),
            section: getInfoValue(positionInfo.eq(2).errorIfEmpty()),
            district: getInfoValue(positionInfo.eq(3).errorIfEmpty()),
            start: mandateTime.substr(0, mandateTime.indexOf("-")).trim(),
            end: mandateTime.substr(mandateTime.indexOf("-") + 1).trim(),
            email: email,
            phone: "",
            extension: getInfoValue(contactInfo.eq(1).errorIfEmpty()),
            office: getInfoValue(contactInfo.eq(0).errorIfEmpty()),
            cv: senator.find(".compartir_senador > li > a").eq(1).attr("href"),
            role: "senator",
            jurisdiction: "AR-B"
          });
        });

        resolve(loadCommittees(senators, nextPage, $("#form1")));
      }).catch(reject);
    });
  };

  return {
    run () {
      return loadNextPage();
    }
  };
};
