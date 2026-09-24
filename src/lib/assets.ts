import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
};

export class AssetError extends Error {}

export interface ImageSize {
  width: number;
  height: number;
}

/** A smaller copy of an image, for `srcset`. */
export interface ImageVariant {
  url: string;
  width: number;
}

/**
 * Widths of the smaller copies made for the images listed in `src/data/responsive-images.json`.
 * An image gets a copy at each width that is less than its own.
 */
export const RESPONSIVE_WIDTHS = [800, 1200] as const;

/**
 * Sharp's PNG and JPEG settings for the smaller copies.
 * The PNG copies use a 256-color palette, as many of the original screenshots do.
 * These settings are part of each copy's hashed URL.
 */
const VARIANT_ENCODING = { png: { palette: true, compressionLevel: 9, effort: 10 }, jpeg: { quality: 82 } } as const;

/**
 * Indexes the files in `assets/`, compiles Sass,
 * and assigns content-hashed public URLs under `/assets/`.
 */
export class AssetManifest {
  readonly #assets = new Map<string, Asset>();
  readonly #stems = new Map<string, Asset>();
  readonly #built = new Map<string, { url: string; contents: Buffer }>();
  readonly #sizes = new Map<string, Promise<ImageSize | undefined>>();
  readonly #responsive: Set<string>;
  readonly root: string;

  constructor(root = ROOT) {
    this.root = root;
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
    const responsive = path.join(root, "src/data/responsive-images.json");
    this.#responsive = new Set(
      existsSync(responsive) ? (JSON.parse(readFileSync(responsive, "utf8")) as string[]) : [],
    );
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

  /** The images listed in `src/data/responsive-images.json`. */
  get responsiveImages(): Asset[] {
    return [...this.#responsive].map((name) => this.resolve(name));
  }

  /**
   * The smaller copies of an image listed in `src/data/responsive-images.json`, narrowest first.
   * Other images have none.
   */
  async variants(asset: Asset): Promise<ImageVariant[]> {
    if (!this.#responsive.has(asset.logical)) return [];
    const size = await this.size(asset);
    if (!size) throw new AssetError(`Responsive image "${asset.logical}" has no known size`);
    const extension = path.extname(asset.logical);
    const stem = asset.logical.slice(0, asset.logical.length - extension.length);
    const source = this.build(asset).url;
    return RESPONSIVE_WIDTHS.filter((width) => width < size.width).map((width) => {
      const digest = createHash("sha256")
        .update(JSON.stringify([source, width, VARIANT_ENCODING]))
        .digest("hex")
        .slice(0, 16);
      return { url: `/assets/${stem}-${width}w-${digest}${extension}`, width };
    });
  }

  /** Makes the smaller copies of the images in `src/data/responsive-images.json`, keyed by URL. */
  async variantOutputs(): Promise<Map<string, { asset: Asset; contents: Buffer }>> {
    const outputs = new Map<string, { asset: Asset; contents: Buffer }>();
    await Promise.all(
      this.responsiveImages.map(async (asset) => {
        const { contents } = this.build(asset);
        for (const { url, width } of await this.variants(asset)) {
          const image = sharp(contents).resize({ width });
          const resized = asset.logical.endsWith(".png")
            ? image.png(VARIANT_ENCODING.png)
            : asset.logical.endsWith(".jpg")
              ? image.jpeg(VARIANT_ENCODING.jpeg)
              : undefined;
          if (!resized) throw new AssetError(`Responsive image "${asset.logical}" must be a PNG or JPEG file`);
          outputs.set(url, { asset, contents: await resized.toBuffer() });
        }
      }),
    );
    return outputs;
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
      silenceDeprecations: ["import", "global-builtin", "color-functions", "slash-div", "mixed-decls"],
      quietDeps: true,
      logger: sass.Logger.silent,
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

/**
 * The size given by the `width` and `height` attributes of an SVG file's root element.
 * A size from the `viewBox` alone is not used:
 * without width and height, the browser sizes the image to fit its container.
 */
function svgSize(svg: string): ImageSize | undefined {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const length = (name: string) => {
    const value = root.match(new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)(?:px)?\\s*["']`, "i"))?.[1];
    return value ? Number(value) : undefined;
  };
  const width = length("width");
  const height = length("height");
  return width && height ? { width, height } : undefined;
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

/** Discards the shared manifest so that changed files are picked up. */
export function resetAssetManifest(): void {
  shared = undefined;
}
