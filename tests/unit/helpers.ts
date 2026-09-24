import { assetManifest } from "../../src/lib/assets.ts";
import { renderDocument, type RenderResult } from "../../src/lib/render/index.ts";
import { markdownProcessor } from "../../src/lib/render/markdown.ts";

const renderer = markdownProcessor().createRenderer({ syntaxHighlight: false });

/** Renders Markdown with the same Unified processor as the site. */
export async function markdown(source: string): Promise<string> {
  return (await (await renderer).render(`\n${source}`)).code;
}

/** Renders an article body through Liquid, Markdown, and the HTML transformations. */
export function render(body: string, file = "fixture.md"): Promise<RenderResult> {
  return renderDocument(body, {
    file,
    assets: assetManifest(),
    markdown,
    page: { title: "Fixture", url: "/fixture/", excerpt: "An excerpt." },
    time: new Date("2026-01-01T12:00:00Z"),
  });
}
