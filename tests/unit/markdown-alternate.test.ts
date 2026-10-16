import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { htmlToMarkdown, markdownPath, pageMarkdown, pageURL } from "../../src/lib/markdown-alternate.ts";
import { render } from "./helpers.ts";

const URL = "https://nshipster.com/fixture";
const fixture = (name: string) => readFileSync(new globalThis.URL(`../fixtures/${name}.md`, import.meta.url), "utf8");
const snapshot = (name: string) => `../fixtures/__snapshots__/${name}.md`;

/** Renders an article body to HTML, then converts the HTML to Markdown. */
async function convert(source: string): Promise<string> {
  return htmlToMarkdown((await render(source)).html, URL);
}

describe("Markdown versions of articles", () => {
  it("keeps the language and text of code without highlighting", async () => {
    const markdown = await convert(fixture("code"));
    expect(markdown).toContain("```swift\nlet url = URL(string: <#string#>)!\nlet value = <#[optional value]#>\n```");
    expect(markdown).toContain("```objc\nNSURL *url");
    expect(markdown).toContain("```console\n$ swift build");
    expect(markdown).toContain("```xcconfig\n");
    expect(markdown).toContain("```jwt\n");
    expect(markdown).toContain("```\nPlain text <b>not bold</b>\n```");
    expect(markdown).not.toContain("<span");
    // Code tabs become consecutive code blocks, without the tab buttons.
    expect(markdown).not.toMatch(/^Swift$/m);
    // Heading anchors are removed.
    expect(markdown).toContain("## Code Listings\n");
    expect(markdown).not.toContain("](#");
    await expect(markdown).toMatchFileSnapshot(snapshot("code"));
  });

  it("writes callouts as block quotes with absolute links", async () => {
    const markdown = await convert(fixture("callouts"));
    expect(markdown).toContain(
      "> An **info** callout with `code` and a [link](https://example.com/).\n>\n> A second paragraph.",
    );
    expect(markdown).toContain("> A warning.");
    await expect(markdown).toMatchFileSnapshot(snapshot("callouts"));
  });

  it("keeps the text of citations and the bibliography", async () => {
    const markdown = await convert(fixture("citations"));
    expect(markdown).toContain("Credentials leak every day (Meli et al., 2019).");
    expect(markdown).toContain("##### References\n\n1. Meli, M.");
    await expect(markdown).toMatchFileSnapshot(snapshot("citations"));
  });

  it("converts Markdown inside HTML", async () => {
    await expect(await convert(fixture("markdown-in-html"))).toMatchFileSnapshot(snapshot("markdown-in-html"));
  });

  it("keeps footnotes", async () => {
    const markdown = await convert("First[^note-2]. One[^a], two[^a].\n\n[^note-2]: Numbered label.\n[^a]: Repeated.");
    expect(markdown).toContain("First[^note-2]. One[^a], two[^a].");
    expect(markdown).toContain("[^note-2]: Numbered label.");
    expect(markdown).toContain("[^a]: Repeated.");
    expect(markdown).not.toContain("↩");
    expect(markdown).not.toContain("[](");
  });

  it("keeps footnote labels with percent signs", async () => {
    const markdown = await convert("All[^100%].\n\n[^100%]: Everything.");
    expect(markdown).toBe("All[^100%].\n\n[^100%]: Everything.\n");
  });

  it("resolves links and images against the page URL", async () => {
    const markdown = await convert("[Swift](/swift-documentation/) ![Logo](/logo.png)\n\nSee 10<sup>5</sup> samples.");
    expect(markdown).toContain("[Swift](https://nshipster.com/swift-documentation/)");
    expect(markdown).toContain("![Logo](https://nshipster.com/logo.png)");
    expect(markdown).toContain("10<sup>5</sup> samples");
  });

  it("links to videos with their poster or label", () => {
    const markdown = htmlToMarkdown(
      [
        '<video aria-label="A demo" poster="/demo.png" controls><source src="/demo.mp4" type="video/mp4"></video>',
        '<p><video aria-label="A recording" src="/recording.mov" controls></video></p>',
      ].join("\n"),
      URL,
    );
    expect(markdown).toContain("[![A demo](https://nshipster.com/demo.png)](https://nshipster.com/demo.mp4)");
    expect(markdown).toContain("[A recording](https://nshipster.com/recording.mov)");
  });
});

describe("pageMarkdown", () => {
  const page = (head: string) => `<!doctype html>
<html><head>
<link rel="canonical" href="https://nshipster.com/nscache">
${head}
<meta property="article:published_time" content="2012-07-14T07:00:00.000Z">
<meta property="article:modified_time" content="2019-01-07T08:00:00.000Z">
</head><body><main>
<article role="article">
<header>
<h1 class="title"><a href="/nscache">NS​Cache</a></h1>
<div class="byline">Written by <span class="authors"><a rel="author" class="author" href="/authors/mattt">Mattt</a> <a rel="author" class="author" href="/authors/nate-cook">Nate Cook</a></span>
<time datetime="2019-01-07T08:00:00.000Z">January 7, 2019</time></div>
</header>
<div class="content"><h2><a class="anchor" aria-hidden="true" id="usage" href="#usage"></a>Usage</h2>
<p>Poor <code>NS<wbr>Cache</code>.</p></div>
<footer><p>Questions? Corrections?</p></footer>
</article>
</main></body></html>`;

  it("converts a page that links to its Markdown version", () => {
    const alternate = pageMarkdown(page('<link rel="alternate" type="text/markdown" href="/nscache.md">'));
    expect(alternate?.path).toBe("/nscache.md");
    expect(alternate?.markdown).toBe(
      [
        "# NSCache",
        "",
        "By [Mattt](https://nshipster.com/authors/mattt) and [Nate Cook](https://nshipster.com/authors/nate-cook).",
        "Published 2012-07-14; updated 2019-01-07.",
        "Canonical URL: <https://nshipster.com/nscache>",
        "",
        "## Usage",
        "",
        "Poor `NSCache`.",
        "",
      ].join("\n"),
    );
  });

  it("skips a page that doesn't link to a Markdown version", () => {
    expect(pageMarkdown(page(""))).toBeUndefined();
  });

  it("requests the page from the development server for any path", () => {
    expect(pageURL("http://127.0.0.1:4321/", "/nscache.md").href).toBe("http://127.0.0.1:4321/nscache");
    // `/%2F127.0.0.1:8080/admin.md`, decoded.
    const url = pageURL("http://127.0.0.1:4321/", "//127.0.0.1:8080/admin.md");
    expect(url.origin).toBe("http://127.0.0.1:4321");
  });

  it("appends .md to the page path", () => {
    expect(markdownPath("/nscache")).toBe("/nscache.md");
    expect(markdownPath("/nscache/")).toBe("/nscache.md");
  });
});
