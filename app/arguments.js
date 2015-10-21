/** Parses a list of command-line arguments into a configuration object. It
 * supports any combination of the following formats:
 *
 * foo=bar --foo=bar command1 --foo bar command2
 *
 * "Orphan" arguments are considered as commands and they're put into a
 * commands list.
 *
 * @param {String[]} list List of arguments to parse. Cannot be null.
 */
module.exports = function arguments(list) {
  var args = {
    commands: []
  };
  var skip = false;

  process.argv.splice(2).forEach((item, index, items) => {
    var equalsPos = item.indexOf("=");
    var key = item;

    if (skip) {
      skip = false;
      return;
    }

    if (equalsPos > -1) {
      if (item.substr(0, 2) === "--") {
        key = item.substr(2, equalsPos - 2).trim();
      } else {
        key = item.substr(0, equalsPos).trim();
      }
      args[key] = item.substr(equalsPos + 1).trim();
    } else if (item.substr(0, 2) === "--") {
      args[item.substr(2)] = items[index + 1];
      skip = true;
    } else {
      args.commands.push(item);
    }
  });

  return Object.assign(args, {
    has (key) {
      return this.hasOwnProperty(key);
    },
    get (key) {
      return this[key];
    }
  });
};
