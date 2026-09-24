import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import * as sass from "sass";
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

/**
 * Indexes the files in `assets/`, compiles Sass,
 * and assigns content-hashed public URLs under `/assets/`.
 */
export class AssetManifest {
  readonly #assets = new Map<string, Asset>();
  readonly #stems = new Map<string, Asset>();
  readonly #built = new Map<string, { url: string; contents: Buffer }>();
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

  /** The text of an asset, e.g. an inline SVG or compiled stylesheet. */
  text(name: string): string {
    return this.build(this.resolve(name)).contents.toString("utf8");
  }

  /** A digest of an asset's output, used to invalidate rendered content. */
  digest(name: string): string {
    const asset = this.find(name);
    return asset ? this.build(asset).url : `missing:${name}`;
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
