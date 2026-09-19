import type { AssetManifest } from "../assets.ts";
import { readBooks } from "../content/books.ts";
import { zoned } from "../dates.ts";
import { CitationContext } from "./citations.ts";
import { preprocessKramdown } from "./kramdown.ts";
import { renderLiquid, siteScope, type RenderEnvironment } from "./liquid.ts";
import { bookHTML } from "./partials.ts";
import { transformHTML } from "./transforms.ts";

/** Renders Markdown to HTML with the configured Astro Markdown processor. */
export type MarkdownRenderer = (markdown: string) => Promise<string>;

export interface RenderOptions {
  /** The source file, used in error messages. */
  file: string;
  /** Page variables available to Liquid. */
  page: Record<string, unknown>;
  assets: AssetManifest;
  markdown: MarkdownRenderer;
  /** The build time, exposed as `site.time`. */
  time?: Date;
}

export interface RenderResult {
  html: string;
  /** Logical names of the assets the document references. */
  assets: string[];
  /** Citation keys, in order of first citation. */
  citations: string[];
}

const PLACEHOLDER = "￼";

/**
 * Replaces Kramdown `{::nomarkdown}` blocks with HTML comments
 * and restores their content after Markdown rendering.
 */
export function protectRawBlocks(text: string): { text: string; restore: (html: string) => string } {
  const blocks: string[] = [];
  const protectedText = text.replace(/\{::nomarkdown[^}]*\}([\s\S]*?)\{:\/\}/g, (_, content: string) => {
    blocks.push(content);
    return `<!--nshipster-raw-${blocks.length - 1}-->`;
  });
  return {
    text: protectedText,
    restore: (html) => html.replace(/<!--nshipster-raw-(\d+)-->/g, (_, index: string) => blocks[Number(index)]!),
  };
}

/** Renders a Markdown fragment, such as an excerpt or author biography, like Jekyll's `markdownify`. */
export async function renderFragment(markdown: string, render: MarkdownRenderer): Promise<string> {
  return transformHTML(await render(markdown));
}

/**
 * Renders an article in the order the Jekyll site did:
 * Liquid, then Markdown, then HTML transformations.
 */
export async function renderDocument(body: string, options: RenderOptions): Promise<RenderResult> {
  const citations = new CitationContext();
  const books = readBooks();
  const environment: RenderEnvironment = {
    assets: options.assets,
    citations,
    dependencies: new Set(),
    markdownify: (markdown) => renderFragment(markdown, options.markdown),
    include: async (name, parameters) => {
      if (name !== "book.html") throw new Error(`Unsupported include "${name}"`);
      const book = books.find((candidate) => candidate.name === parameters.book);
      if (!book) throw new Error(`Unknown book "${String(parameters.book)}"`);
      environment.dependencies.add(book.image);
      return bookHTML(book, options.assets.url(book.image), await environment.markdownify(book.summary));
    },
  };

  const liquid = await renderLiquid(
    body,
    { page: options.page, site: siteScope(zoned(options.time ?? new Date())) },
    environment,
    options.file,
  );

  const { text, restore } = protectRawBlocks(liquid.replaceAll("<#...#>", PLACEHOLDER));
  let html: string;
  try {
    html = restore(await options.markdown(preprocessKramdown(text)));
  } catch (error) {
    throw new Error(`Markdown error in ${options.file}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }

  return {
    html: transformHTML(html),
    assets: [...environment.dependencies],
    citations: citations.cited,
  };
}
