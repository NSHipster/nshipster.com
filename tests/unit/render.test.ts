import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { render } from "./helpers.ts";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}.md`, import.meta.url), "utf8");
const snapshot = (name: string) => `../fixtures/__snapshots__/${name}.html`;

describe("article rendering", () => {
  it("renders callouts with Markdown content", async () => {
    const { html } = await render(fixture("callouts"));
    expect(html).toContain('<aside class="admonition info">');
    expect(html).toContain("<strong>info</strong>");
    expect(html).toContain('<aside class="admonition warning">');
    expect(html).toContain('<aside class="admonition error">');
    expect(html).not.toContain("markdown=");
    await expect(html).toMatchFileSnapshot(snapshot("callouts"));
  });

  it("links citations to a bibliography in citation order", async () => {
    const { html, citations } = await render(fixture("citations"));
    expect(citations).toEqual(["meli_2019", "de_montjoye_2013"]);
    expect(html).toContain('<a class="citation" href="#meli_2019">(Meli et al., 2019)</a>');
    expect(html.indexOf('id="meli_2019"')).toBeLessThan(html.indexOf('id="de_montjoye_2013"'));
    await expect(html).toMatchFileSnapshot(snapshot("citations"));
  });

  it("keeps raw Liquid and evaluates assignments and captures", async () => {
    const { html } = await render(fixture("raw-liquid"));
    expect(html).toContain("{{#people}}{{fullName}}{{/people}}");
    expect(html).not.toContain("This comment is removed");
    expect(html).toContain("The description is “An excerpt.”, and the greeting is “Hello from Fixture”.");
    expect(html).toContain("The year is 2026.");
    await expect(html).toMatchFileSnapshot(snapshot("raw-liquid"));
  });

  it("keeps text after an inline Liquid comment", async () => {
    const source = [
      "{% comment %}Inline comment{% endcomment %}Text after the comment.",
      "",
      "{% comment %}",
      "A later full-line comment.",
      "{% endcomment %}",
      "",
      "Text after both comments.",
    ].join("\n");
    const { html } = await render(source);
    expect(html).toContain("Text after the comment.");
    expect(html).toContain("Text after both comments.");
    expect(html).not.toContain("Inline comment");
    expect(html).not.toContain("A later full-line comment.");
  });

  it("parses Markdown inside HTML the way Kramdown did", async () => {
    const { html } = await render(fixture("markdown-in-html"));
    expect(html).toContain("<code>uv</code>");
    expect(html).toContain("<dt><code>Localized<wbr>Error</code></dt>");
    expect(html).toContain('<a href="https://en.wikipedia.org/wiki/ISO/IEC_80000" rel="noopener noreferrer">');
    expect(html).toContain("<samp>\n`&lt;CNMutableContact: 0x7ff727e38bb0: ... />`<br>and more...\n</samp>");
    expect(html).toContain("<p>This **is not** Markdown.</p>");
    expect(html).toMatch(/<table>\s*<tbody>/);
    expect(html).toContain("A line with a hard break <br>");
    expect(html).toContain("<dt><code>@property</code></dt>");
    await expect(html).toMatchFileSnapshot(snapshot("markdown-in-html"));
  });

  it("highlights code with placeholders, labels, and tabs", async () => {
    const { html } = await render(fixture("code"));
    expect(html).toContain('<var class="placeholder">string</var>');
    expect(html).toContain('<var class="placeholder optional" title="Optional">optional value</var>');
    expect(html).toContain('<div class="highlight-group"><div role="tablist" aria-label="Languages">');
    expect(html).toContain('data-lang="Terminal"');
    expect(html).toContain('data-lang="Xcode Build Settings"');
    expect(html).toContain('data-lang="JWT"');
    expect(html).toContain('data-lang="plaintext"');
    expect(html).toContain("Plain text &lt;b>not bold&lt;/b>");
    expect(html).toContain('<code><var class="placeholder">…</var></code>');
    expect(html).toContain('<a class="anchor" aria-hidden="true" id="code-listings" href="#code-listings"></a>');
    // Repeated headings get Kramdown's GFM suffixes.
    expect(html).toContain('id="code-listings-1"');
    expect(html).toContain('id="code-listing-1-xcode-build-settings"');
    expect(html).toContain('<a id="get-on-with-it"></a>');
    await expect(html).toMatchFileSnapshot(snapshot("code"));
  });

  it("restores placeholders after highlighting structured data", async () => {
    const source = [
      "```json",
      '{ "value": "<#JSON value#>" }',
      "```",
      "",
      "```turtle",
      ":subject :predicate <#Turtle object#> .",
      "```",
      "",
      "```sparql",
      "SELECT <#variables#> WHERE {}",
      "```",
    ].join("\n");
    const { html } = await render(source);
    expect(html).toContain('<var class="placeholder">JSON value</var>');
    expect(html).toContain('<var class="placeholder">Turtle object</var>');
    expect(html).toContain('<var class="placeholder">variables</var>');
    expect(html).not.toContain("NSHIPSTER_PLACEHOLDER");
  });

  it("uses the rendered book summary in structured data", async () => {
    const { html } = await render('{% include book.html book="cfhipsterref" %}');
    expect(html).toContain(
      '"description": "Perfect for intermediate and expert developers wanting to take a deeper dive into advanced topics, CFHipsterRef: Low-Level Programming on iOS &amp; OS X covers',
    );
    expect(html).not.toContain(
      '"description": "Perfect for intermediate and expert developers wanting to take a deeper dive into advanced topics, _CFHipsterRef',
    );
  });

  it("escapes fenced language labels", async () => {
    const { html } = await render('```unknown" onclick="alert(1)\ncode\n```');
    expect(html).toContain('data-lang="unknown&quot;"');
    expect(html).not.toContain('onclick="alert(1)"');
  });

  it("secures links based on their parsed origin", async () => {
    const { html } = await render(
      "[same origin](https://nshipster.com/example) [external](https://attacker.example/nshipster.com/) [protocol relative](//attacker.example/)",
    );
    expect(html).toContain('<a href="https://nshipster.com/example">same origin</a>');
    expect(html).toContain('<a href="https://attacker.example/nshipster.com/" rel="noopener noreferrer">external</a>');
    expect(html).toContain('<a href="//attacker.example/" rel="noopener noreferrer">protocol relative</a>');
  });

  it("keeps footnote labels and gives repeated references unique IDs", async () => {
    const source = "First[^note-2]. One[^a], two[^a].\n\n[^note-2]: Numbered label.\n[^a]: Repeated.";
    const { html } = await render(source);
    expect(html).toContain('id="fnref:note-2"');
    expect(html).toContain('id="fn:note-2"');
    expect(html).toContain('id="fnref:a"');
    expect(html).toContain('id="fnref:a:1"');
    expect(html).toContain('href="#fnref:a:1"');
  });

  it("names the source file for a missing asset", async () => {
    await expect(render("{% asset does-not-exist.png %}", "2020-01-01-missing.md")).rejects.toThrow(
      /2020-01-01-missing\.md.*does-not-exist\.png/,
    );
  });

  it("names the source file for an unresolved citation", async () => {
    await expect(render("{% cite nobody_1999 %}", "2020-01-01-uncited.md")).rejects.toThrow(
      /2020-01-01-uncited\.md.*nobody_1999/,
    );
  });

  it("names the source file for unsupported Liquid", async () => {
    await expect(render("{% unknown_tag %}", "2020-01-01-unknown.md")).rejects.toThrow(/2020-01-01-unknown\.md/);
  });
});
