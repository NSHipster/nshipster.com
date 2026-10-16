import type { Element, ElementContent, Root as HastRoot } from "hast";
import { fromHtml } from "hast-util-from-html";
import { select, selectAll } from "hast-util-select";
import { defaultHandlers, toMdast, type Handle } from "hast-util-to-mdast";
import { toString } from "hast-util-to-string";
import type { FootnoteDefinition, Nodes as MdastNodes, PhrasingContent, Root as MdastRoot, RootContent } from "mdast";
import { gfmFootnoteToMarkdown } from "mdast-util-gfm-footnote";
import { gfmStrikethroughToMarkdown } from "mdast-util-gfm-strikethrough";
import { gfmTableToMarkdown } from "mdast-util-gfm-table";
import { toMarkdown } from "mdast-util-to-markdown";

/**
 * Markdown versions of articles for agents and other programs,
 * published at the article's URL with `.md` appended (`/nscache.md`).
 *
 * The Markdown is converted from the built page,
 * so it has the same content as the HTML whether the article
 * was written in Kramdown with Liquid tags, MDX, or Markdoc.
 * Code keeps its language and loses its highlighting,
 * code tabs become consecutive code blocks,
 * callouts become block quotes, and URLs are absolute.
 */

/**
 * The URL of the page with the Markdown version at `pathname`, on the server at `origin`.
 * The URL stays on that server even if the path starts with `//`.
 */
export function pageURL(origin: string, pathname: string): URL {
  const url = new URL(origin);
  url.pathname = pathname.replace(/\.md$/, "");
  return url;
}

export interface MarkdownAlternate {
  /** The path that the page gives in its `<link rel="alternate" type="text/markdown">`. */
  path: string;
  markdown: string;
}

/**
 * Converts a built article page to Markdown.
 * Returns `undefined` for a page that doesn't link to a Markdown version.
 */
export function pageMarkdown(html: string): MarkdownAlternate | undefined {
  // Skip parsing pages that can't have a Markdown version.
  if (!html.includes('type="text/markdown"')) return undefined;
  const tree = fromHtml(html);
  const alternate = select('head link[rel~="alternate"][type="text/markdown"]', tree);
  const canonical = select('head link[rel~="canonical"]', tree);
  const article = select("article[role=article]", tree);
  const content = article && select(":scope > .content", article);
  if (!alternate || !canonical || !article || !content) return undefined;

  const url = String(canonical.properties.href);
  // The title links to the page itself.
  const title = select("header h1.title > a", article) ?? select("header h1.title", article);
  const heading: RootContent = {
    type: "heading",
    depth: 1,
    children: title ? phrasing(title, url) : [],
  };
  const body = convert(content.children, url);
  return {
    path: new URL(String(alternate.properties.href), url).pathname,
    markdown: stringify({ type: "root", children: [heading, byline(tree, article, url), ...body.children] }),
  };
}

/** Converts an HTML fragment of article content to Markdown, resolving URLs against `url`. */
export function htmlToMarkdown(html: string, url: string): string {
  return stringify(convert(fromHtml(html, { fragment: true }).children, url));
}

/**
 * The byline, "By [Mattt](…). Published 2012-07-14; updated 2019-01-07.",
 * followed by the canonical URL.
 */
function byline(tree: HastRoot, article: Element, url: string): RootContent {
  const children: PhrasingContent[] = [];
  const authors = select(".byline .authors", article);
  const links = authors ? selectAll("a.author", authors) : [];
  // Some older articles credit coauthors in text, as in "Nate Cook, Mattt".
  const people = links.length > 0 ? links : authors ? [authors] : [];
  if (people.length > 0) {
    children.push({ type: "text", value: "By " });
    people.forEach((person, index) => {
      if (index > 0) {
        const last = index === people.length - 1;
        children.push({ type: "text", value: people.length > 2 ? (last ? ", and " : ", ") : " and " });
      }
      const name: PhrasingContent = { type: "text", value: toString(person).trim() };
      const href = person.tagName === "a" && person.properties.href;
      children.push(href ? { type: "link", url: new URL(String(href), url).href, children: [name] } : name);
    });
    children.push({ type: "text", value: ".\n" });
  }
  // Articles give both dates; other pages with the article layout give the date shown in the byline.
  const meta = (property: string) => select(`head meta[property="${property}"]`, tree)?.properties.content;
  const day = (date: unknown) => (typeof date === "string" ? date.slice(0, 10) : undefined);
  const published = day(meta("article:published_time") ?? select(".byline time", article)?.properties.dateTime);
  const modified = day(meta("article:modified_time"));
  if (published) {
    const updated = modified && modified !== published ? `; updated ${modified}` : "";
    children.push({ type: "text", value: `Published ${published}${updated}.\n` });
  }
  children.push(
    { type: "text", value: "Canonical URL: " },
    { type: "link", url, children: [{ type: "text", value: url }] },
  );
  return { type: "paragraph", children };
}

/** Code fence languages for the labels in `data-lang`; see `languageLabel` in `render/highlight.ts`. */
const FENCES: Record<string, string> = {
  "Objective-C": "objc",
  "obj-c": "objc",
  Terminal: "console",
  "Xcode Build Settings": "xcconfig",
  "JSON-LD": "jsonld",
  "N-Triples": "ntriples",
  plaintext: "",
  text: "",
};

function fenceLanguage(label: string | undefined): string | null {
  if (!label) return null;
  return (FENCES[label] ?? label.toLowerCase().replace(/\s+/g, "-")) || null;
}

const hasClass = (node: Element, name: string) =>
  Array.isArray(node.properties.className) && node.properties.className.includes(name);

/** Converts article content to an mdast tree. */
function convert(children: ElementContent[] | HastRoot["children"], url: string): MdastRoot {
  const root: HastRoot = { type: "root", children: structuredClone(children) as HastRoot["children"] };
  prepare(root);
  // A `<base>` element makes `hast-util-to-mdast` resolve links and images to absolute URLs.
  root.children.unshift({ type: "element", tagName: "base", properties: { href: url }, children: [] });
  return toMdast(root, { handlers }) as MdastRoot;
}

/** Converts the content of a phrasing element, such as the title. */
function phrasing(node: Element, url: string): PhrasingContent[] {
  const paragraph = convert([{ type: "element", tagName: "p", properties: {}, children: node.children }], url)
    .children[0];
  return paragraph?.type === "paragraph" ? paragraph.children : [];
}

/** Removes the parts of the page that only make sense in a browser. */
function prepare(tree: HastRoot): void {
  const removed = (node: HastRoot["children"][number]) =>
    node.type === "comment" ||
    (node.type === "element" &&
      // Heading permalinks and other empty anchors.
      ((node.tagName === "a" && node.children.length === 0) ||
        // Code tab buttons; the listings that they switch between are kept.
        node.properties.role === "tablist" ||
        // Links from footnotes back to their references.
        node.properties.role === "doc-backlink" ||
        // Line break opportunities, which `hast-util-to-mdast` turns into zero-width spaces.
        node.tagName === "wbr" ||
        // Hidden content, like a caption that repeats a summary, except hidden code tabs.
        (node.properties.hidden !== undefined && node.properties.hidden !== false && node.tagName !== "pre") ||
        ["script", "style", "canvas", "button"].includes(node.tagName)));
  const visit = (parent: HastRoot | Element) => {
    const children = (parent.children as HastRoot["children"]).filter((child) => !removed(child));
    parent.children = children as Element["children"];
    for (const child of children) {
      if (child.type === "element" && child.tagName !== "pre") visit(child);
      // Titles have zero-width spaces between camel-case words, like `<wbr>` elements.
      else if (child.type === "text") child.value = child.value.replaceAll("\u200B", "");
    }
  };
  visit(tree);

  // Placeholders in code are written as Xcode placeholders, as in the article source.
  for (const code of selectAll("pre, code", tree)) {
    for (const variable of selectAll("var.placeholder", code)) {
      const name = toString(variable);
      const value = hasClass(variable, "optional") ? `<#[${name}]#>` : `<#${name}#>`;
      variable.tagName = "span";
      variable.properties = {};
      variable.children = [{ type: "text", value }];
    }
  }
}

const handlers: Record<string, Handle> = {
  pre(state, node) {
    if (!hasClass(node, "highlight")) return defaultHandlers.pre!(state, node);
    const result = {
      type: "code" as const,
      lang: fenceLanguage(node.properties.dataLang as string | undefined),
      meta: null,
      value: toString(node).replace(/\n+$/, ""),
    };
    state.patch(node, result);
    return result;
  },

  // Callouts and asides become block quotes.
  aside: (state, node) => defaultHandlers.blockquote!(state, node),

  // In-text citations keep their text; the bibliography follows the article.
  a(state, node) {
    if (hasClass(node, "citation")) return state.all(node);
    return defaultHandlers.a!(state, node);
  },

  sup(state, node) {
    const link = select("a[href]", node);
    if (node.properties.role === "doc-noteref" && link) {
      const label = footnoteLabel(String(link.properties.href));
      const result = { type: "footnoteReference" as const, identifier: label.toLowerCase(), label };
      state.patch(node, result);
      return result;
    }
    // Keep superscripts like the exponent in 10<sup>5</sup> distinct from the text around them.
    return { type: "html", value: `<sup>${escapeHTML(toString(node))}</sup>` };
  },

  sub: (_state, node) => ({ type: "html", value: `<sub>${escapeHTML(toString(node))}</sub>` }),

  div(state, node) {
    if (node.properties.role !== "doc-endnotes") return defaultHandlers.div!(state, node);
    const definitions: FootnoteDefinition[] = [];
    for (const item of selectAll("li[role=doc-endnote]", node)) {
      const label = footnoteLabel(String(item.properties.id));
      const children = state.toFlow(state.all(item)) as FootnoteDefinition["children"];
      definitions.push({ type: "footnoteDefinition", identifier: label.toLowerCase(), label, children });
    }
    return definitions;
  },

  video(state, node) {
    const result = defaultHandlers.video!(state, node);
    // The link to a video shows its poster or, without one, its label.
    const label = String(node.properties.ariaLabel ?? node.properties.title ?? "Video");
    if (result && !Array.isArray(result) && result.type === "link") {
      const [poster] = result.children;
      if (!poster) result.children = [{ type: "text", value: label }];
      else if (poster.type === "image" && !poster.alt) poster.alt = label;
    }
    return result;
  },
};

/** The label in a footnote ID or link, which `convertFootnotes` in `render/transforms.ts` has already decoded. */
const footnoteLabel = (value: string) => value.replace(/^#?fn(?:ref)?:/, "");

const escapeHTML = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function stringify(tree: MdastNodes): string {
  return toMarkdown(tree, {
    bullet: "-",
    emphasis: "_",
    fence: "`",
    fences: true,
    listItemIndent: "one",
    rule: "-",
    // Tables aren't padded to align their columns, which would add many spaces.
    extensions: [gfmFootnoteToMarkdown(), gfmStrikethroughToMarkdown(), gfmTableToMarkdown({ tablePipeAlign: false })],
  });
}
