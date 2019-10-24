import lunr from "lunr";

export const handler = (event, context, callback) => {
  (async () => {
    const query = event.queryStringParameters.q;

    if (!query || query === "") {
      callback(null, {
        statusCode: 400
      });
    } else {
      const json = fs.readFileSync(require.resolve("./index.json"));

      var index = lunr(function() {
        this.ref("url");
        this.field("title", { boost: 10 });
        this.field("category");
        this.field("excerpt");

        json.forEach(function(doc) {
          this.add(doc);
        }, this);
      });

      const results = index.search(query);

      callback(null, {
        statusCode: 200,
        body: JSON.stringify(results)
      });
    }
  })();
};
