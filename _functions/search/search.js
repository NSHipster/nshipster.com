const fs = require("fs");
const lunr = require("lunr");

const json = JSON.parse(fs.readFileSync(require.resolve("./index.json")));
var index = lunr(function() {
  this.ref("url");
  this.field("title", { boost: 10 });
  this.field("category");
  this.field("excerpt");

  json.forEach(function(doc) {
    console.log(doc);
    this.add(doc);
  }, this);
});

exports.handler = function(event, context, callback) {
  const query = event.queryStringParameters.q;

  if (!query || query === "") {
    callback(null, {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid query" })
    });
  } else {
    const results = index.search(query);
    callback(null, {
      statusCode: 200,
      body: JSON.stringify(results)
    });
  }
};
