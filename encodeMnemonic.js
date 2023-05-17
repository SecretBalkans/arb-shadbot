const fs = require('fs')
const path = require('path');

const args = process.argv.slice(2);
const encodedMnemonic = Buffer.from(args[0]).toString('base64');

fs.readFile(path.join(__dirname, '.secrets.js'), 'utf8', function (err,data) {
  if (err) {
    return console.log(err);
  }
  var result = data.replace(/__MNEMONIC_PLACEHOLDER__/g, encodedMnemonic);

  fs.writeFile(path.join(__dirname, '.secrets.js'), result, 'utf8', function (err) {
     if (err) return console.log(err);
  });
});

console.log("\n\n\nYour menmonic sequence was encoded and written in .secret.js file! \nHave fun with the Shadbot\n\n\n");