import { AssetManifest, assetManifest } from "../../src/lib/assets.ts";
import { renderDocument, type RenderResult } from "../../src/lib/render/index.ts";
import { markdownProcessor } from "../../src/lib/render/markdown.ts";
import { ROOT } from "../../src/lib/site.ts";

const renderer = markdownProcessor().createRenderer({ syntaxHighlight: false });

/** Asset manifests that make smaller copies of images with sharp, and that use Cloudflare Image Transformations. */
export const manifests = {
  sharp: new AssetManifest(ROOT, { imageTransformations: false }),
  cloudflare: new AssetManifest(ROOT, { imageTransformations: true }),
};

/** Renders Markdown with the same Unified processor as the site. */
export async function markdown(source: string): Promise<string> {
  return (await (await renderer).render(`\n${source}`)).code;
}

/** Renders an article body through Liquid, Markdown, and the HTML transformations. */
export function render(body: string, file = "fixture.md", assets = assetManifest()): Promise<RenderResult> {
  return renderDocument(body, {
    file,
    assets,
    markdown,
    page: { title: "Fixture", url: "/fixture/", excerpt: "An excerpt." },
    time: new Date("2026-01-01T12:00:00Z"),
  });
}
