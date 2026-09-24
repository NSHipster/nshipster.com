import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { assetManifest } from "../../src/lib/assets.ts";
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
