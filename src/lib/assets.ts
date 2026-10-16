import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { imageMetadata } from "astro/assets/utils";
import * as sass from "sass";
import sharp from "sharp";
import { ROOT, paths } from "./site.ts";

/**
 * Asset search roots, in the same order as the Jekyll asset pipeline.
 * A logical path like `articles/caemitterlayer.css` or `logo.svg`
 * is relative to one of these directories.
 */
const SOURCE_DIRECTORIES = ["css", "fonts", "images", "js", "videos"] as const;

export type AssetKind = "image" | "stylesheet" | "script" | "font" | "media" | "file";

export interface Asset {
  /** The logical path used by `{% asset %}` tags, e.g. `articles/dark-mode.css`. */
  logical: string;
  /** Absolute path to the source file. */
  source: string;
  kind: AssetKind;
}

const KINDS: Record<string, AssetKind> = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".gif": "image",
  ".svg": "image",
  ".webp": "image",
  ".css": "stylesheet",
  ".scss": "stylesheet",
  ".js": "script",
  ".woff": "font",
  ".woff2": "font",
  ".mp4": "media",
  ".m4v": "media",
  ".mov": "media",
  ".srt": "file",
  ".vtt": "file",
};

export class AssetError extends Error {}

export interface ImageSize {
  width: number;
  height: number;
}

/** A WebP copy of an image, for `srcset`. */
export interface ImageVariant {
  url: string;
  width: number;
}

/**
 * Widths of the WebP copies of PNG, JPEG, and WebP images.
 * An image gets a copy at each width that is less than its own, and one at its own width.
 * Images are never made larger.
 */
export const IMAGE_WIDTHS = [400, 800, 1200, 1600] as const;

/**
 * Sharp's WebP settings for the copies.
 * These settings and the sharp version are part of each copy's URL and cache key.
 */
const WEBP_ENCODING = { quality: 80 } as const;

/**
 * The directory that keeps encoded WebP copies between builds, named by a digest of their source and settings.
 * It is inside Astro's cache directory, which Workers Builds restores before each build
 * and the CI workflow restores after `npm ci`, which deletes `node_modules`.
 */
export const IMAGE_CACHE = path.join(ROOT, "node_modules/.astro/article-images");

/** The number of WebP copies that a manifest encoded, and that it read from the cache. */
export interface ImageCacheStatistics {
  encoded: number;
  cached: number;
}

/**
 * Indexes the files in `assets/`, compiles Sass,
 * and assigns content-hashed public URLs under `/assets/`.
 */
export class AssetManifest {
  readonly #assets = new Map<string, Asset>();
  readonly #stems = new Map<string, Asset>();
  readonly #built = new Map<string, { url: string; contents: Buffer }>();
  readonly #sizes = new Map<string, Promise<ImageSize | undefined>>();
  readonly #variants = new Map<string, Promise<Array<ImageVariant & { contents: Buffer }>>>();
  readonly #encoded = new Map<string, Promise<Buffer>>();
  readonly root: string;
  /** The directory that keeps encoded WebP copies between builds. */
  readonly imageCache: string;
  readonly imageCacheStatistics: ImageCacheStatistics = { encoded: 0, cached: 0 };

  constructor(root = ROOT, { imageCache = IMAGE_CACHE } = {}) {
    this.root = root;
    this.imageCache = imageCache;
    for (const directory of SOURCE_DIRECTORIES) {
      const base = path.join(root, paths.assets, directory);
      for (const file of walk(base)) {
        const relative = path.relative(base, file).split(path.sep).join("/");
        if (directory === "css" && path.basename(relative).startsWith("_")) continue;
        const logical = relative.replace(/\.scss$/, ".css");
        const extension = path.extname(file).toLowerCase();
        const asset: Asset = { logical, source: file, kind: KINDS[extension] ?? "file" };
        this.#assets.set(logical, asset);
        this.#stems.set(logical.replace(/\.[^./]+$/, ""), asset);
      }
    }
  }

  /** All assets, keyed by logical path. */
  get all(): Asset[] {
    return [...this.#assets.values()];
  }

  /** Finds an asset by logical path. Names without an extension match any extension. */
  find(name: string): Asset | undefined {
    const logical = name.trim().replace(/^\/+/, "");
    return this.#assets.get(logical) ?? this.#stems.get(logical);
  }

  /** Like `find`, but throws an error naming the missing asset. */
  resolve(name: string): Asset {
    const asset = this.find(name);
    if (!asset) throw new AssetError(`Missing asset "${name}"`);
    return asset;
  }

  /** Returns the output bytes and hashed URL for an asset. */
  build(asset: Asset): { url: string; contents: Buffer } {
    const cached = this.#built.get(asset.logical);
    if (cached) return cached;

    const contents = asset.source.endsWith(".scss")
      ? Buffer.from(this.compileStylesheet(asset.source))
      : asset.source.endsWith(".js")
        ? Buffer.from(this.bundleScript(asset.source))
        : readFileSync(asset.source);
    const digest = createHash("sha256").update(contents).digest("hex").slice(0, 16);
    const extension = path.extname(asset.logical);
    const stem = asset.logical.slice(0, asset.logical.length - extension.length);
    const result = { url: `/assets/${stem}-${digest}${extension}`, contents };
    this.#built.set(asset.logical, result);
    return result;
  }

  /** The public URL of an asset, resolved by logical name. */
  url(name: string): string {
    return this.build(this.resolve(name)).url;
  }

  /** A digest of an asset's output, used to invalidate rendered content. */
  digest(name: string): string {
    const asset = this.find(name);
    return asset ? this.build(asset).url : `missing:${name}`;
  }

  /** The width and height of an image in pixels, or `undefined` if they are unknown. */
  size(asset: Asset): Promise<ImageSize | undefined> {
    let size = this.#sizes.get(asset.logical);
    if (!size) {
      const { contents } = this.build(asset);
      size = asset.logical.endsWith(".svg")
        ? Promise.resolve(svgSize(contents.toString("utf8")))
        : imageMetadata(contents, asset.logical).then(
            ({ width, height }) => ({ width, height }),
            () => undefined,
          );
      this.#sizes.set(asset.logical, size);
    }
    return size;
  }

  /** Whether an image gets WebP copies: PNG, JPEG, and WebP images that aren't animated. */
  hasVariants(asset: Asset): boolean {
    return (
      asset.kind === "image" && /\.(png|jpe?g|webp)$/i.test(asset.logical) && !isAnimated(this.build(asset).contents)
    );
  }

  /**
   * The WebP copies of a PNG, JPEG, or WebP image, narrowest first.
   * There is a copy at each of `IMAGE_WIDTHS` that is less than the image's own width, and one at its own width,
   * but a copy is listed only if it has fewer bytes than the original and every wider copy listed.
   * Other images, such as GIF and SVG images, have none.
   */
  async variants(asset: Asset): Promise<ImageVariant[]> {
    return (await this.#encodedVariants(asset)).map(({ url, width }) => ({ url, width }));
  }

  #encodedVariants(asset: Asset): Promise<Array<ImageVariant & { contents: Buffer }>> {
    let variants = this.#variants.get(asset.logical);
    if (!variants) {
      variants = (async () => {
        if (!this.hasVariants(asset)) return [];
        const size = await this.size(asset);
        if (!size) return [];
        const original = this.build(asset);
        const extension = path.extname(asset.logical);
        const stem = asset.logical.slice(0, asset.logical.length - extension.length);
        const widths = [...IMAGE_WIDTHS.filter((width) => width < size.width), size.width];
        const encoded = await Promise.all(
          widths.map(async (width) => {
            const digest = createHash("sha256")
              .update(JSON.stringify([original.url, width, WEBP_ENCODING, sharp.versions.sharp]))
              .digest("hex");
            const contents = await this.#encode(digest, original.contents, width);
            return { url: `/assets/${stem}-${width}w-${digest.slice(0, 16)}.webp`, width, contents };
          }),
        );
        // Lossy WebP can be larger than a screenshot that uses a PNG palette,
        // and a resized screenshot can be larger than a wider copy.
        const listed: typeof encoded = [];
        let limit = original.contents.length;
        for (const variant of encoded.reverse()) {
          if (variant.contents.length >= limit) continue;
          listed.unshift(variant);
          limit = variant.contents.length;
        }
        return listed;
      })();
      this.#variants.set(asset.logical, variants);
    }
    return variants;
  }

  /** Encodes an image as WebP at a width, or reads the copy that an earlier build kept in the cache. */
  #encode(digest: string, source: Buffer, width: number): Promise<Buffer> {
    let encoded = this.#encoded.get(digest);
    if (!encoded) {
      const file = path.join(this.imageCache, `${digest}.webp`);
      if (existsSync(file)) {
        this.imageCacheStatistics.cached++;
        encoded = Promise.resolve(readFileSync(file));
      } else {
        encoded = sharp(source)
          .autoOrient()
          .resize({ width })
          .webp(WEBP_ENCODING)
          .toBuffer()
          .then((contents) => {
            this.imageCacheStatistics.encoded++;
            // Write to a temporary file and rename it, so that a concurrent build never reads part of a file.
            mkdirSync(this.imageCache, { recursive: true });
            const temporary = `${file}.${process.pid}.tmp`;
            writeFileSync(temporary, contents);
            renameSync(temporary, file);
            return contents;
          });
      }
      this.#encoded.set(digest, encoded);
    }
    return encoded;
  }

  /** Makes the WebP copies of the images in `assets/`, keyed by URL. */
  async variantOutputs(): Promise<Map<string, { asset: Asset; contents: Buffer }>> {
    const outputs = new Map<string, { asset: Asset; contents: Buffer }>();
    await Promise.all(
      this.all.map(async (asset) => {
        for (const { url, contents } of await this.#encodedVariants(asset)) outputs.set(url, { asset, contents });
      }),
    );
    return outputs;
  }

  /** The WebP copy of an image at a URL, for the development server, or `undefined` if there is none. */
  async variantOutput(url: string): Promise<Buffer | undefined> {
    const stem = url.match(/^\/assets\/(.+)-\d+w-[0-9a-f]{16}\.webp$/)?.[1];
    if (!stem) return undefined;
    for (const asset of this.all) {
      if (!asset.logical.startsWith(`${stem}.`)) continue;
      const variant = (await this.#encodedVariants(asset)).find((candidate) => candidate.url === url);
      if (variant) return variant.contents;
    }
    return undefined;
  }

  /**
   * Deletes the files in the image cache that this manifest didn't use,
   * such as copies of changed images, so that the cache doesn't grow. Returns the number deleted.
   */
  pruneImageCache(): number {
    if (!existsSync(this.imageCache)) return 0;
    let count = 0;
    for (const entry of readdirSync(this.imageCache)) {
      if (this.#encoded.has(entry.replace(/\.webp$/, ""))) continue;
      rmSync(path.join(this.imageCache, entry), { force: true, recursive: true });
      count++;
    }
    return count;
  }

  /** Maps each hashed URL to its asset, for serving and writing output files. */
  outputs(): Map<string, { asset: Asset; contents: Buffer }> {
    const outputs = new Map<string, { asset: Asset; contents: Buffer }>();
    for (const asset of this.#assets.values()) {
      const { url, contents } = this.build(asset);
      outputs.set(url, { asset, contents });
    }
    return outputs;
  }

  /**
   * Resolves Sprockets `//= require` directives at the top of a script
   * by prepending the required scripts, as the Jekyll asset pipeline did.
   */
  bundleScript(file: string, seen = new Set<string>()): string {
    seen.add(file);
    const source = readFileSync(file, "utf8");
    const parts: string[] = [];
    for (const match of source.matchAll(/^\/\/= require (\S+)\s*$/gm)) {
      const name = match[1]!.endsWith(".js") ? match[1]! : `${match[1]}.js`;
      const required = path.join(this.root, paths.assets, "js", name);
      if (!seen.has(required)) parts.push(this.bundleScript(required, seen));
    }
    parts.push(source.replace(/^\/\/= require \S+\s*$/gm, ""));
    return parts.join("\n");
  }

  /**
   * Compiles a stylesheet with Dart Sass.
   * `font_path()` and `asset_url()` replace the Sprockets helpers
   * that the existing stylesheets use.
   */
  compileStylesheet(file: string): string {
    const result = sass.compile(file, {
      style: "compressed",
      loadPaths: [path.join(this.root, paths.assets, "css")],
      functions: {
        "font_path($name)": (args) => {
          const name = args[0]!.assertString("name").text;
          return new sass.SassString(this.url(name), { quotes: true });
        },
        "asset_path($name)": (args) => {
          const name = args[0]!.assertString("name").text;
          return new sass.SassString(this.url(name), { quotes: true });
        },
        "asset_url($name)": (args) => {
          const name = args[0]!.assertString("name").text;
          return new sass.SassString(`url(${this.url(name)})`, { quotes: false });
        },
      },
    });
    return result.css.replace(/^\uFEFF/, "");
  }
}

/** CSS pixels per unit, for the absolute lengths that an SVG file's `width` and `height` can use. */
const SVG_UNITS: Record<string, number> = {
  "": 1,
  px: 1,
  pt: 4 / 3,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
};

/**
 * The size of an SVG file in whole CSS pixels, from the `width` and `height` of its root element.
 * The `viewBox` gives a dimension that is missing or relative, such as a percentage.
 * Without either, the size is unknown.
 */
export function svgSize(svg: string): ImageSize | undefined {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const attribute = (name: string) => root.match(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, "is"))?.[2];
  const length = (name: string) => {
    const match = attribute(name)?.match(/^\s*(\d*\.?\d+)\s*([a-z]*)\s*$/i);
    const scale = match && SVG_UNITS[match[2]!.toLowerCase()];
    return scale ? Number(match[1]) * scale : undefined;
  };
  const viewBox = attribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const ratio = viewBox?.length === 4 && viewBox[2]! > 0 && viewBox[3]! > 0 ? viewBox[2]! / viewBox[3]! : undefined;
  let width = length("width");
  let height = length("height");
  if (ratio) {
    width ??= height === undefined ? viewBox![2]! : height * ratio;
    height ??= width / ratio;
  }
  if (!width || !height) return undefined;
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

/**
 * Whether a PNG or WebP file is animated.
 * An animated PNG has an `acTL` chunk before its image data,
 * and an animated WebP file sets the animation flag in its `VP8X` chunk.
 * Sharp reads only the first frame of an animated PNG.
 */
export function isAnimated(contents: Buffer): boolean {
  if (contents.subarray(1, 4).toString("latin1") === "PNG") {
    for (let offset = 8; offset + 8 <= contents.length;) {
      const type = contents.subarray(offset + 4, offset + 8).toString("latin1");
      if (type === "acTL") return true;
      if (type === "IDAT") return false;
      offset += 12 + contents.readUInt32BE(offset);
    }
    return false;
  }
  if (contents.subarray(8, 12).toString("latin1") === "WEBP") {
    return contents.subarray(12, 16).toString("latin1") === "VP8X" && (contents[20]! & 0x02) !== 0;
  }
  return false;
}

function* walk(directory: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(directory).sort();
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const file = path.join(directory, entry);
    if (statSync(file).isDirectory()) yield* walk(file);
    else yield file;
  }
}

let shared: AssetManifest | undefined;

/** The manifest shared by the content loader, pages, and build integration. */
export function assetManifest(): AssetManifest {
  shared ??= new AssetManifest();
  return shared;
}

/** The public URL of an asset by logical name, for use in MDX expressions. */
export function assetUrl(name: string): string {
  return assetManifest().url(name);
}

/** Discards the shared manifest so that changed files are picked up. */
export function resetAssetManifest(): void {
  shared = undefined;
}
