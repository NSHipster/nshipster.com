import { readFileSync } from "node:fs";
import Markdoc from "@markdoc/markdoc";
import { describe, expect, it } from "vite-plus/test";
import markdocConfig from "../../markdoc.config.ts";
import { assetManifest } from "../../src/lib/assets.ts";
import { currentCitedKeys, recordCitations, withCitations } from "../../src/lib/render/citations.ts";
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
    expect(html).toContain('<code translate="no">uv</code>');
    expect(html).toContain('<dt><code translate="no">Localized<wbr>Error</code></dt>');
    expect(html).toContain('<a href="https://en.wikipedia.org/wiki/ISO/IEC_80000" rel="noopener noreferrer">');
    expect(html).toContain("<samp>\n`&lt;CNMutableContact: 0x7ff727e38bb0: ... />`<br>and more...\n</samp>");
    expect(html).toContain("<p>This **is not** Markdown.</p>");
    expect(html).toMatch(/<table>\s*<tbody>/);
    expect(html).toContain("A line with a hard break <br>");
    expect(html).toContain('<dt><code translate="no">@property</code></dt>');
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
    expect(html).toContain('<code translate="no"><var class="placeholder">…</var></code>');
    expect(html).toContain(
      '<a class="anchor" aria-hidden="true" tabindex="-1" id="code-listings" href="#code-listings"></a>',
    );
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

  it("keeps translation tools out of code listings and inline code", async () => {
    const { html } = await render(
      'Call `doSomething()`.\n\n```swift\nlet x = 1\n```\n\n{::nomarkdown}<pre><code>raw</code></pre>{:/}\n\n<code translate="yes">kept</code>',
    );
    expect(html).toContain('<code translate="no">do<wbr>Something()</code>');
    expect(html).toContain('<pre class="highlight" data-lang="Swift" translate="no"><code>');
    expect(html).toContain('<pre translate="no"><code>raw</code></pre>');
    expect(html).toContain('<code translate="yes">kept</code>');
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

  it("sizes images, loads images after the first lazily, and lists WebP copies", async () => {
    const assets = assetManifest();
    const url = (name: string) => assets.url(name);
    /** The `srcset` URLs of an element, keyed by width. */
    const candidates = (element: string) =>
      Object.fromEntries(
        element
          .match(/srcset="([^"]*)"/)![1]!
          .split(", ")
          .map((candidate) => candidate.split(" "))
          .map(([url, width]) => [Number.parseInt(width!), url!]),
      );
    const copy = (name: string, width: number) => new RegExp(`^/assets/${name}-${width}w-[0-9a-f]{16}\\.webp$`);
    const source = [
      "{% asset uiactivity-airDrop.png %}",
      "",
      "![Banner]({% asset wwdc-2019.jpg @path %})",
      "",
      '<img src="{% asset wwdc-twitter-app--light.png @path %}" alt="Twitter App" width="600">',
      "",
      "<picture>",
      '<source srcset="{% asset uncertainty-screenshot--dark.png @path %}" media="(prefers-color-scheme: dark)">',
      '<img src="{% asset uncertainty-screenshot--light.png @path %}" alt="Screenshot">',
      "</picture>",
      "",
      "{% asset caemitterlayer-confetti.png %}",
      "",
      "{% asset alert.gif %}",
      "",
      "{% asset gpuimage-pipeline.svg %}",
    ].join("\n");
    const { html } = await render(source, "fixture.md", assets);
    const images = [...html.matchAll(/<img [^>]*>/g)].map((match) => match[0]);

    // A WebP copy of this small PNG image would be larger, so it has none.
    expect(images[0]).toContain(`src="${url("uiactivity-airDrop.png")}"`);
    expect(images[0]).not.toContain("loading=");
    expect(images[0]).not.toContain("srcset=");

    // The original stays in `src`, and a WebP copy at the image's own width replaces it in `srcset`.
    expect(images[1]).toContain(`src="${url("wwdc-2019.jpg")}"`);
    expect(images[1]).toContain('loading="lazy"');
    expect(images[1]).toContain('width="1632" height="691"');
    const banner = candidates(images[1]!);
    expect(Object.keys(banner).map(Number)).toEqual([400, 800, 1200, 1600, 1632]);
    for (const [width, candidate] of Object.entries(banner)) expect(candidate).toMatch(copy("wwdc-2019", +width));
    expect(images[1]).toContain('sizes="(min-width: 918px) 875px, calc(100vw - 43px)"');

    // The height follows from the article's width and the image's aspect ratio.
    expect(images[2]).toContain('width="600"');
    expect(images[2]).toContain('height="519"');
    // The copy 1200 pixels wide is larger than the one at the image's own width, so it isn't listed.
    const twitter = candidates(images[2]!);
    expect(Object.keys(twitter).map(Number)).toEqual([400, 800, 1520]);
    expect(twitter[1520]).toMatch(copy("wwdc-twitter-app--light", 1520));
    expect(images[2]).toContain('sizes="(min-width: 643px) 600px, calc(100vw - 43px)"');

    expect(candidates(images[3]!)[800]).toMatch(copy("uncertainty-screenshot--light", 800));
    expect(images[3]).toContain('sizes="(min-width: 918px) 875px, calc(100vw - 43px)"');
    const dark = html.match(/<source [^>]*>/)![0];
    expect(candidates(dark)[2916]).toMatch(copy("uncertainty-screenshot--dark", 2916));
    expect(dark).toContain('sizes="(min-width: 918px) 875px, calc(100vw - 43px)"');

    // Animated PNG, GIF, and SVG images stay as they are.
    expect(images[4]).toContain(`src="${url("caemitterlayer-confetti.png")}"`);
    expect(images[4]).not.toContain("srcset=");
    expect(images[5]).not.toContain("srcset=");
    expect(images[6]).not.toContain("srcset=");
  });

  it("sizes SVG images and keeps a percentage width in the style", async () => {
    const source = [
      "{% asset gpuimage-pipeline.svg %}",
      "",
      "{% asset swift-operators-one-plus-two.svg %}",
      "",
      '{% asset contact-tracing-equation.svg width="100%" %}',
    ].join("\n");
    const { html } = await render(source);
    const images = [...html.matchAll(/<img [^>]*>/g)].map((match) => match[0]);

    // The width and height are in points.
    expect(images[0]).toContain('width="753" height="101"');
    // Only the view box gives the size.
    expect(images[1]).toContain('width="600" height="200"');
    expect(images[2]).toContain('width="553"');
    expect(images[2]).toContain('height="42"');
    expect(images[2]).toContain('style="width: 100%;"');
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

  it("isolates citation tracking between concurrent execution scopes", async () => {
    await Promise.all([
      withCitations(async () => {
        recordCitations(["key_a"]);
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(currentCitedKeys()).toEqual(["key_a"]);
      }),
      withCitations(async () => {
        recordCitations(["key_b"]);
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(currentCitedKeys()).toEqual(["key_b"]);
      }),
    ]);
  });

  it("normalizes heading IDs using legacy ASCII transliteration", () => {
    const ast = Markdoc.parse("## L’addition s’il vous plaît\n\n## L’addition s’il vous plaît");
    const content = Markdoc.transform(ast, markdocConfig as any) as any[];
    const headings = content.filter((c: any) => c?.attributes?.__collectHeading);
    expect(headings[0].attributes.id).toBe("laddition-sil-vous-plait");
    expect(headings[1].attributes.id).toBe("laddition-sil-vous-plait-1");
  });

  it("recursively consolidates consecutive fences inside nested tags", async () => {
    const ast = Markdoc.parse("{% info %}\n```swift\nlet x = 1\n```\n```objc\nint x = 1;\n```\n{% /info %}");
    const transformed = Markdoc.transform(ast, markdocConfig as any);
    const content = (transformed instanceof Promise ? await transformed : transformed) as any[];
    const infoTag = content[0];
    expect(infoTag.name.path).toContain("Info.astro");
    const html = String(infoTag.children[0]);
    expect(html).toContain('<div class="highlight-group">');
    expect(html).toContain('id="code-listing-1-swift"');
    expect(html).toContain('translate="no"');
  });

  it("keeps translation tools out of Markdoc inline code", async () => {
    const ast = Markdoc.parse("Call `doSomething()`.");
    const transformed = Markdoc.transform(ast, markdocConfig as any);
    const content = (transformed instanceof Promise ? await transformed : transformed) as any[];
    const code = content[0].children[1];
    expect(code.name).toBe("code");
    expect(code.attributes).toEqual({ translate: "no" });
  });
});
