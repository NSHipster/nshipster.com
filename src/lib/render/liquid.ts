import {
  Liquid,
  Tag,
  type Context,
  type Emitter,
  type Parser,
  type TagToken,
  type Template,
  type TopLevelToken,
} from "liquidjs";
import type { AssetManifest } from "../assets.ts";
import { parseDate, strftime, xmlschema, type ZonedDate } from "../dates.ts";
import { absoluteURL, site } from "../site.ts";
import type { CitationContext } from "./citations.ts";
import { scalarText } from "../scalar.ts";

/**
 * Per-document state that custom tags read from the Liquid context.
 * Stored under a key that articles cannot reference.
 */
export interface RenderEnvironment {
  assets: AssetManifest;
  citations: CitationContext;
  /** Logical names of the assets that the document references. */
  dependencies: Set<string>;
  /** Renders Markdown for the `markdownify` filter. */
  markdownify: (markdown: string) => Promise<string>;
  /** Renders an include such as `book.html`. */
  include?: (name: string, parameters: Record<string, unknown>) => Promise<string>;
}

const ENVIRONMENT = "__nshipster";

function environment(context: Context): RenderEnvironment {
  const value = context.environments as Record<string, unknown>;
  const env = value[ENVIRONMENT] as RenderEnvironment | undefined;
  if (!env) throw new Error("Missing render environment");
  return env;
}

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * Splits `{% asset %}` arguments the way jekyll-assets did:
 * a (possibly quoted) name, `key=value` attributes, `@flags`,
 * bare boolean attributes such as `defer`, and `!attribute` removals.
 */
export function parseAssetArguments(input: string) {
  const unquote = (value: string) => value.replace(/^(["'])([\s\S]*)\1$/, "$2");
  // A quoted value ends at the last quote before the next argument,
  // so values like `alt="Entry for "apple""` keep their text; inner quotes are dropped.
  const pattern =
    /([\w-]+)=(?:"([\s\S]*?)"|'([\s\S]*?)')(?=\s+[\w-]+=|\s+[@!]|\s*$)|([\w-]+)=([^\s"']+)|"([^"]*)"|'([^']*)'|(\S+)/g;
  const tokens: Array<{ key?: string; value: string }> = [];
  for (const match of input.trim().matchAll(pattern)) {
    if (match[1]) tokens.push({ key: match[1], value: (match[2] ?? match[3] ?? "").replace(/["']/g, "") });
    else if (match[4]) tokens.push({ key: match[4], value: match[5]! });
    else tokens.push({ value: match[6] ?? match[7] ?? match[8]! });
  }

  const [first, ...rest] = tokens;
  const attributes: Array<[string, string | true]> = [];
  const flags = new Set<string>();
  for (const token of rest) {
    if (token.key) attributes.push([token.key, token.value]);
    else if (token.value.startsWith("@")) flags.add(token.value.slice(1));
    else if (token.value.startsWith("!")) flags.add(token.value);
    else attributes.push([unquote(token.value), true]);
  }
  return { name: unquote(first?.value ?? ""), attributes, flags };
}

function attributeString(attributes: Array<[string, string | true]>): string {
  return attributes
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${escapeAttribute(value)}"`))
    .join("");
}

/** Applies attributes to the root element of inline SVG markup. */
function inlineSVG(svg: string, attributes: Array<[string, string | true]>): string {
  let markup = svg
    .replace(/<\?xml[\s\S]*?\?>\s*/, "")
    .replace(/<!DOCTYPE[\s\S]*?>\s*/i, "")
    .trim();
  for (const [key, value] of attributes) {
    const rendered = value === true ? key : `${key}="${escapeAttribute(value)}"`;
    const existing = new RegExp(`(<svg\\b[^>]*?)\\s${key}="[^"]*"`, "i");
    markup = existing.test(markup)
      ? markup.replace(existing, `$1 ${rendered}`)
      : markup.replace(/<svg\b/i, `<svg ${rendered}`);
  }
  return markup;
}

/** Renders an `{% asset %}` tag for a resolved asset. */
export function renderAssetTag(assets: AssetManifest, args: ReturnType<typeof parseAssetArguments>): string {
  const asset = assets.resolve(args.name);
  const { url, contents } = assets.build(asset);
  const attributes = args.attributes.filter(([key]) => !args.flags.has(`!${key}`));

  if (args.flags.has("path")) return url;
  if (args.flags.has("url")) return absoluteURL(url);

  if (args.flags.has("inline")) {
    if (asset.logical.endsWith(".svg")) return inlineSVG(contents.toString("utf8"), attributes);
    if (asset.kind === "stylesheet") return `<style>${contents.toString("utf8")}</style>`;
    if (asset.kind === "script") return `<script>${contents.toString("utf8")}</script>`;
  }

  switch (asset.kind) {
    case "stylesheet":
      return `<link rel="stylesheet" href="${url}"${attributeString(attributes)}>`;
    case "script":
      return `<script src="${url}"${attributeString(attributes)}></script>`;
    case "media":
      return `<video src="${url}"${attributeString(attributes)}></video>`;
    case "image":
      return `<img${attributeString(attributes)} src="${url}">`;
    default:
      return url;
  }
}

class AssetTag extends Tag {
  readonly #args: string;
  constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
    super(token, remain, liquid);
    this.#args = token.args;
  }
  *render(context: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const env = environment(context);
    // Asset names may contain Liquid, e.g. `"{{ author.image }}"`.
    const args = (yield this.liquid.parseAndRender(this.#args, context.getAll() as object)) as string;
    const parsed = parseAssetArguments(args);
    env.dependencies.add(parsed.name);
    emitter.write(renderAssetTag(env.assets, parsed));
  }
}

/** `{% info %}`, `{% warning %}`, and `{% error %}` callouts. */
function admonition(type: string) {
  return class extends Tag {
    readonly templates: Template[] = [];
    constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid, parser: Parser) {
      super(token, remain, liquid);
      const stream = parser
        .parseStream(remain)
        .on(`tag:end${type}`, () => stream.stop())
        .on("template", (template: Template) => this.templates.push(template))
        .on("end", () => {
          throw new Error(`tag ${token.getText()} not closed`);
        });
      stream.start();
    }
    *render(context: Context, emitter: Emitter): Generator<unknown, void, unknown> {
      const content = (yield this.liquid.renderer.renderTemplates(this.templates, context)) as string;
      // Blank lines let the Markdown inside the callout be parsed as Markdown.
      emitter.write(`<aside class="admonition ${type}" markdown="1">\n\n${content.trim()}\n\n</aside>`);
    }
  };
}

class CiteTag extends Tag {
  readonly #keys: string[];
  constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
    super(token, remain, liquid);
    this.#keys = token.args
      .trim()
      .split(/\s+/)
      .filter((key) => !key.startsWith("--"));
  }
  render(context: Context, emitter: Emitter): void {
    emitter.write(environment(context).citations.cite(this.#keys));
  }
}

class BibliographyTag extends Tag {
  constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
    super(token, remain, liquid);
    if (!/--cited\b/.test(token.args)) {
      throw new Error("Only `{% bibliography --cited %}` is supported");
    }
  }
  render(context: Context, emitter: Emitter): void {
    emitter.write(environment(context).citations.bibliography());
  }
}

class IncludeTag extends Tag {
  readonly #name: string;
  readonly #parameters: string;
  constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
    super(token, remain, liquid);
    const [name = "", ...rest] = token.args.trim().split(/\s+/);
    this.#name = name;
    this.#parameters = rest.join(" ");
  }
  *render(context: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const env = environment(context);
    if (!env.include) throw new Error(`Unsupported include "${this.#name}"`);
    const parameters: Record<string, unknown> = {};
    for (const match of this.#parameters.matchAll(/([\w-]+)=("[^"]*"|'[^']*'|\S+)/g)) {
      const raw = match[2]!;
      parameters[match[1]!] = /^["']/.test(raw) ? raw.slice(1, -1) : yield this.liquid.evalValue(raw, context);
    }
    emitter.write((yield env.include(this.#name, parameters)) as string);
  }
}

/** Coerces the values that Liquid passes to date filters. */
export function toZonedDate(input: unknown): ZonedDate | undefined {
  if (input && typeof input === "object" && "offset" in input && "year" in input) return input as ZonedDate;
  if (input === "now" || input === "today") return parseDate(new Date().toISOString());
  return parseDate(input);
}

function stripHTML(input: unknown): string {
  return scalarText(input)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "");
}

/** Inserts zero-width spaces between camel-case words so long titles can wrap. */
export function camelBreak(input: string): string {
  return input.replace(/([a-z]{2,})([A-Z]+)/g, "$1​$2").replace(/(mac|tv)​(OS)/g, "$1$2");
}

let engine: Liquid | undefined;

/** The shared Liquid engine with the Jekyll site's tags and filters. */
export function liquidEngine(): Liquid {
  if (engine) return engine;
  const liquid = new Liquid({
    strictFilters: true,
    strictVariables: false,
    // Match Jekyll: `{{ nil }}` renders as an empty string, and whitespace is preserved.
    greedy: false,
  });

  liquid.registerTag("asset", AssetTag);
  for (const type of ["info", "warning", "error"]) liquid.registerTag(type, admonition(type));
  liquid.registerTag("cite", CiteTag);
  liquid.registerTag("bibliography", BibliographyTag);
  liquid.registerTag("include", IncludeTag);

  liquid.registerFilter("date", (input: unknown, format: unknown) => {
    const date = toZonedDate(input);
    if (!date || typeof format !== "string" || !format) return input;
    return strftime(date, format);
  });
  liquid.registerFilter("date_to_xmlschema", (input: unknown) => {
    const date = toZonedDate(input);
    return date ? xmlschema(date) : input;
  });
  liquid.registerFilter("absolute_url", (input: unknown) => absoluteURL(scalarText(input)));
  liquid.registerFilter("relative_url", (input: unknown) => scalarText(input));
  liquid.registerFilter("strip_html", stripHTML);
  liquid.registerFilter("camel_break", (input: unknown) => camelBreak(scalarText(input)));
  liquid.registerFilter("host", (input: unknown) => {
    try {
      return new URL(scalarText(input)).host;
    } catch {
      return input;
    }
  });
  liquid.registerFilter("xml_escape", (input: unknown) =>
    scalarText(input)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;"),
  );
  liquid.registerFilter("uri_escape", (input: unknown) => encodeURI(scalarText(input)));
  liquid.registerFilter("normalize_whitespace", (input: unknown) => scalarText(input).replace(/\s+/g, " ").trim());
  liquid.registerFilter("markdownify", async function (this: { context: Context }, input: unknown) {
    return environment(this.context).markdownify(scalarText(input));
  });

  engine = liquid;
  return liquid;
}

export interface LiquidScope {
  page: Record<string, unknown>;
  site: Record<string, unknown>;
}

/** Evaluates the Liquid in an article, naming the source file in any error. */
export async function renderLiquid(
  source: string,
  scope: LiquidScope,
  env: RenderEnvironment,
  file: string,
): Promise<string> {
  const liquid = liquidEngine();
  // A comment that fills its lines is removed with them, so that it leaves no
  // whitespace-only line behind to end an HTML block early.
  const uncommented = source.replace(/^[ \t]*\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}[ \t]*\n/gm, "");
  try {
    const templates = liquid.parse(uncommented, file);
    return await liquid.render(templates, { ...scope, [ENVIRONMENT]: env });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Liquid error in ${file}: ${message}`, { cause: error });
  }
}

/** Site variables available to Liquid in articles. */
export function siteScope(time: ZonedDate): Record<string, unknown> {
  return { title: site.title, url: site.url, lang: site.lang, description: site.description, time };
}
