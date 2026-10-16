import { describe, expect, it } from "vite-plus/test";
import { markdownPath, prefersMarkdown } from "../../src/lib/markdown-negotiation.ts";

describe("markdownPath", () => {
  it("appends .md to the page path", () => {
    expect(markdownPath("/nscache")).toBe("/nscache.md");
    expect(markdownPath("/nscache/")).toBe("/nscache.md");
  });
});

describe("prefersMarkdown", () => {
  it("selects Markdown when the request names it", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
    expect(prefersMarkdown("Text/Markdown; charset=utf-8")).toBe(true);
    expect(prefersMarkdown("text/markdown, text/html;q=0.9, */*;q=0.8")).toBe(true);
    expect(prefersMarkdown("text/html;q=0.5, text/markdown;q=0.6")).toBe(true);
    // With equal qualities, the type that the request names in addition to the page wins.
    expect(prefersMarkdown("text/markdown, text/html")).toBe(true);
    expect(prefersMarkdown("text/markdown, */*")).toBe(true);
  });

  it("selects HTML for browsers and other requests that don't prefer Markdown", () => {
    expect(prefersMarkdown(null)).toBe(false);
    expect(prefersMarkdown("")).toBe(false);
    expect(prefersMarkdown("*/*")).toBe(false);
    expect(prefersMarkdown("text/*")).toBe(false);
    // Chrome and Firefox navigations.
    expect(
      prefersMarkdown(
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      ),
    ).toBe(false);
    expect(prefersMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).toBe(false);
    expect(prefersMarkdown("text/html, text/markdown;q=0.9")).toBe(false);
    expect(prefersMarkdown("text/markdown;q=0, */*")).toBe(false);
    expect(prefersMarkdown("text/markdown;q=0.5, text/*")).toBe(false);
  });

  it("ignores media ranges that aren't valid", () => {
    expect(prefersMarkdown("text/markdown;q=high")).toBe(false);
    expect(prefersMarkdown("text/markdown;q=2")).toBe(false);
    expect(prefersMarkdown("markdown")).toBe(false);
    expect(prefersMarkdown("text/markdown; q = 0.5, text/html;q=x")).toBe(true);
  });
});
