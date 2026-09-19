import { describe, expect, it } from "vite-plus/test";
import { preprocessKramdown } from "../../src/lib/render/kramdown.ts";
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

  it("wraps a lone image in a paragraph", () => {
    expect(preprocessKramdown('Text\n\n<img src="x.png">\n\nMore')).toContain('<p>\n<img src="x.png">\n</p>');
  });
});
