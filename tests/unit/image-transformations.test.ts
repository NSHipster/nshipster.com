import type { ImageMetadata, ImageTransform } from "astro";
import { describe, expect, it } from "vite-plus/test";
import service from "../../src/lib/image-service.ts";
import { isTransformable, transformationSource, transformedImageURL } from "../../src/lib/image-transformations.ts";
import { manifests } from "./helpers.ts";

describe("transformedImageURL", () => {
  it("builds a same-origin Cloudflare URL that chooses the format and falls back to the original", () => {
    expect(transformedImageURL("/assets/a-0123.png")).toBe(
      "/cdn-cgi/image/format=auto,onerror=redirect/assets/a-0123.png",
    );
    expect(transformedImageURL("/assets/a-0123.png", { width: 800 })).toBe(
      "/cdn-cgi/image/width=800,format=auto,onerror=redirect/assets/a-0123.png",
    );
    expect(transformedImageURL("/_astro/b.jpg", { width: 300, quality: 70, format: "webp" })).toBe(
      "/cdn-cgi/image/width=300,quality=70,format=webp,onerror=redirect/_astro/b.jpg",
    );
  });

  it("transforms only images on this site", () => {
    expect(() => transformedImageURL("https://example.com/a.png")).toThrow(/path on this site/);
    expect(() => transformedImageURL("//example.com/a.png")).toThrow(/path on this site/);
  });

  it("finds the original image of a transformed URL", () => {
    expect(transformationSource(transformedImageURL("/assets/a-0123.png", { width: 400 }))).toBe("/assets/a-0123.png");
    expect(transformationSource("/assets/a-0123.png")).toBe("/assets/a-0123.png");
  });

  it("leaves TIFF, SVG, and GIF images untransformed", () => {
    expect(["a.png", "a.jpg", "a.JPEG", "a.webp"].every(isTransformable)).toBe(true);
    expect(["a.tiff", "a.svg", "a.gif", "a.mov"].some(isTransformable)).toBe(false);
  });
});

describe("AssetManifest with image transformations", () => {
  it("lists transformed copies narrower than the image and one at its own width", async () => {
    const assets = manifests.cloudflare;
    const asset = assets.resolve("uncertainty-screenshot--dark.png");
    const source = assets.url("uncertainty-screenshot--dark.png");
    expect(await assets.variants(asset)).toEqual([
      { url: transformedImageURL(source, { width: 400 }), width: 400 },
      { url: transformedImageURL(source, { width: 800 }), width: 800 },
      { url: transformedImageURL(source, { width: 1200 }), width: 1200 },
      { url: transformedImageURL(source, { width: 1600 }), width: 1600 },
      { url: transformedImageURL(source), width: 2916 },
    ]);
    expect(await assets.variants(assets.resolve("alert.gif"))).toEqual([]);
    expect(await assets.variants(assets.resolve("gpuimage-pipeline.svg"))).toEqual([]);
    expect(await assets.variants(assets.resolve("NSShowMe.tiff"))).toEqual([]);
  });

  it("makes no smaller copies", async () => {
    expect((await manifests.cloudflare.variantOutputs()).size).toBe(0);
  });
});

describe("Cloudflare image service", () => {
  // The service reads neither the image configuration nor the logger.
  const context = [{}, {}] as unknown as [never, never];
  const image = (src: string, format: ImageMetadata["format"]): ImageMetadata => ({
    src,
    width: 600,
    height: 600,
    format,
  });

  it("lets Cloudflare choose the format unless a component asks for one", async () => {
    const options = (format?: ImageTransform["format"]) =>
      service.validateOptions!({ src: image("/_astro/mattt.0123.jpg", "jpg"), width: 300, format }, ...context);
    expect((await options()).format).toBe("auto");
    expect((await options("png")).format).toBe("png");
  });

  it("links imported images to Cloudflare transformations", async () => {
    const url = (src: string, format: ImageMetadata["format"]) =>
      service.getURL({ src: image(src, format), width: 300, height: 300, format: "auto" }, ...context);
    expect(await url("/_astro/mattt.0123.jpg", "jpg")).toBe(
      "/cdn-cgi/image/width=300,format=auto,onerror=redirect/_astro/mattt.0123.jpg",
    );
    expect(await url("/_astro/logo.0123.svg", "svg")).toBe("/_astro/logo.0123.svg");
    expect(await url("/_astro/alert.0123.gif", "gif")).toBe("/_astro/alert.0123.gif");
  });

  it("leaves images on other sites as they are", async () => {
    const options = { src: "https://0.gravatar.com/avatar/0123?size=300", width: 300, height: 300 };
    expect(await service.getURL(options, ...context)).toBe(options.src);
  });
});
