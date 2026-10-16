import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { assetManifest, svgSize } from "../../src/lib/assets.ts";
import { portraits } from "../../src/lib/images.ts";
import { ROOT, paths } from "../../src/lib/site.ts";

describe("images", () => {
  it("imports a portrait for each author with an image", () => {
    const directory = path.join(ROOT, paths.authors);
    const images = readdirSync(directory)
      .map((file) => readFileSync(path.join(directory, file), "utf8").match(/^image:\s*(\S+)/m)?.[1])
      .filter((image) => image !== undefined);
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) expect(portraits).toHaveProperty([image]);
  });

  it("makes smaller copies of responsive images at URLs that differ from the original", async () => {
    const assets = assetManifest();
    const outputs = await assets.variantOutputs();
    expect(assets.responsiveImages.length).toBeGreaterThan(0);
    for (const asset of assets.responsiveImages) {
      const original = assets.build(asset);
      const variants = await assets.variants(asset);
      expect(variants.length, asset.logical).toBeGreaterThan(0);
      for (const { url } of variants) {
        expect(url).not.toBe(original.url);
        expect(outputs.get(url)!.contents.length, url).toBeLessThan(original.contents.length);
      }
    }
  }, 120_000);
});

describe("svgSize", () => {
  const svg = (attributes: string) => `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>`;

  it("reads the width and height in CSS pixels", () => {
    expect(svgSize(svg('width="600" height="300"'))).toEqual({ width: 600, height: 300 });
    expect(svgSize(svg('width="553.192px" height="42.000px"'))).toEqual({ width: 553, height: 42 });
    expect(svgSize(svg('height="76pt" width="565pt"'))).toEqual({ width: 753, height: 101 });
  });

  it("uses the view box for a missing or relative dimension", () => {
    expect(svgSize(svg('viewBox="0 0 1012 600"'))).toEqual({ width: 1012, height: 600 });
    expect(svgSize(svg('viewBox="0,0,600,200" width="300"'))).toEqual({ width: 300, height: 100 });
    expect(svgSize(svg('viewBox="0 0 600 200" width="100%" height="50"'))).toEqual({ width: 150, height: 50 });
  });

  it("has no size without absolute dimensions or a view box", () => {
    expect(svgSize(svg(""))).toBeUndefined();
    expect(svgSize(svg('width="100%" height="100%"'))).toBeUndefined();
    expect(svgSize(svg('width="10em" height="2em"'))).toBeUndefined();
  });
});
