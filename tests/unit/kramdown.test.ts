import { describe, expect, it } from "vite-plus/test";
import { EMPTY_HEADER, preprocessKramdown, renderInline } from "../../src/lib/render/kramdown.ts";
import { markdown } from "./helpers.ts";

describe("Kramdown compatibility", () => {
  it("wraps list item paragraphs per item, as Kramdown did", async () => {
    const tight = await markdown("- a\n- b\n\nPara");
    expect(tight).toContain("<li>a</li>");
    expect(tight).toContain("<li>b</li>");

    const loose = await markdown("- a\n\n- b\n\nPara");
    expect(loose).toContain("<p>a</p>");
    expect(loose).toContain("<p>b</p>");

    const mixed = await markdown("- a\n- b\n\n- c\n- d\n\nPara");
    expect(mixed).toMatch(/<li>a<\/li>/);
    expect(mixed).toMatch(/<li>\s*<p>b<\/p>\s*<\/li>/);
    expect(mixed).toMatch(/<li>d<\/li>/);
  });

  it("does not link bare URLs", async () => {
    expect(await markdown("See https://example.com for details.")).not.toContain("<a ");
  });

  it("continues fenced code in a block quote without markers", () => {
    const source = "> ```swift\nlet x = 1\n```\n\n## Next";
    expect(preprocessKramdown(source)).toContain("> let x = 1");
  });

  it("allows spaces in link destinations", () => {
    expect(preprocessKramdown("[Tweet](http://twitter.com/share?text=Hello World)")).toBe(
      "[Tweet](<http://twitter.com/share?text=Hello World>)",
    );
  });

  it("leaves a single-quoted link title outside the destination", async () => {
    const source = "[Example](https://example.com 'A title')";
    expect(preprocessKramdown(source)).toBe(source);
    expect(await markdown(source)).toContain('<a href="https://example.com" title="A title">Example</a>');
  });

  it("does not turn indented HTML paragraphs into code blocks", async () => {
    const source = "    <p>Paragraph with `code`.</p>";
    const html = await markdown(preprocessKramdown(source));
    expect(html).toContain("<p>Paragraph with <code>code</code>.</p>");
    expect(html).not.toContain("<pre>");
  });

  it("renders Markdown in span-level elements without block markup", () => {
    expect(renderInline("1. `First`")).toBe("1. <code>First</code>");
    expect(renderInline("# **Heading text**")).toBe("# <strong>Heading text</strong>");
  });

  it("does not count an escaped table pipe as a column", () => {
    const source = preprocessKramdown("| a \\| b | c |");
    expect(source.match(new RegExp(EMPTY_HEADER, "g"))).toHaveLength(2);
  });

  it("wraps a lone image in a paragraph", () => {
    expect(preprocessKramdown('Text\n\n<img src="x.png">\n\nMore')).toContain('<p>\n<img src="x.png">\n</p>');
  });
});
