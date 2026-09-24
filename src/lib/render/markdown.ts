import { unified as unifiedProcessor } from "@astrojs/markdown-remark";
import type { Element, ElementContent, Root as HastRoot } from "hast";
import type { Code, Heading, Html, List, ListItem, Paragraph, PhrasingContent, Root, RootContent, Text } from "mdast";
import rehypeRaw from "rehype-raw";
import type { Plugin } from "unified";
import { gfmFootnoteFromMarkdown } from "mdast-util-gfm-footnote";
import { gfmStrikethroughFromMarkdown } from "mdast-util-gfm-strikethrough";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { defaultHandlers, type Handler } from "mdast-util-to-hast";
import { toString } from "mdast-util-to-string";
import { gfmFootnote } from "micromark-extension-gfm-footnote";
import { gfmStrikethrough } from "micromark-extension-gfm-strikethrough";
import { gfmTable } from "micromark-extension-gfm-table";
import { visit } from "unist-util-visit";
import type { VFile } from "vfile";
import { highlight, languageLabel } from "./highlight.ts";

/**
 * The Markdown stage of the article pipeline.
 *
 * Articles were written for Kramdown. These plugins reproduce the Kramdown
 * behavior that the articles rely on and that CommonMark lacks or does differently:
 * header IDs, definition lists, and highlighted code listings.
 */

/**
 * Header IDs as Kramdown's GFM parser generated them, from the header's text
 * (without inline HTML tags), followed by the `parameterize` step
 * that the Jekyll site applied to every heading ID.
 */
export function gfmHeaderID(text: string, counter: Map<string, number>): string {
  let id = text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- \t]/gu, "")
    .replace(/[ \t]/g, "-");
  const count = (counter.get(id) ?? -1) + 1;
  counter.set(id, count);
  if (count > 0) id = `${id}-${count}`;
  return parameterize(id);
}

/** Latin letters that Unicode normalization does not decompose. */
const TRANSLITERATIONS: Record<string, string> = {
  æ: "ae",
  Æ: "AE",
  œ: "oe",
  Œ: "OE",
  ß: "ss",
  ø: "o",
  Ø: "O",
  ł: "l",
  Ł: "L",
  đ: "d",
  Đ: "D",
  þ: "th",
  Þ: "TH",
  ð: "d",
  Ð: "D",
};

/** ActiveSupport's `parameterize`, which transliterates to ASCII. */
export function parameterize(input: string): string {
  return input
    .replace(/[æÆœŒßøØłŁđĐþÞðÐ]/g, (character) => TRANSLITERATIONS[character] ?? character)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\-_]+/gi, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

/**
 * Kramdown's basic header ID algorithm, which applied to headers inside HTML elements,
 * using the header's source text.
 */
export function kramdownHeaderID(raw: string, used: Map<string, number>): string {
  let id = raw
    .replace(/^[^a-zA-Z]+/, "")
    .replace(/[^a-zA-Z0-9 -]/g, "")
    .replace(/ /g, "-")
    .toLowerCase();
  if (id === "") id = "section";
  const count = used.get(id);
  if (count === undefined) {
    used.set(id, 0);
  } else {
    used.set(id, count + 1);
    id = `${id}-${count + 1}`;
  }
  return parameterize(id);
}

const BLOCK_TAG =
  /<(\/?)(aside|div|section|article|header|footer|figure|figcaption|details|blockquote|center)\b[^>]*>/gi;

/**
 * Assigns Kramdown-style IDs to Markdown headings.
 * Headings at the top level get GFM-style IDs from their text.
 * Headings inside HTML elements get IDs from Kramdown's basic algorithm,
 * with a separate counter, as they did in the Jekyll site.
 */
export const remarkKramdownHeadingIds: Plugin<[], Root> = () => (tree, file) => {
  const gfm = new Map<string, number>();
  const basic = new Map<string, number>();
  const source = String(file.value);
  let depth = 0;
  for (const node of tree.children) {
    if (node.type === "html") {
      for (const match of node.value.matchAll(BLOCK_TAG)) depth = Math.max(0, depth + (match[1] ? -1 : 1));
      continue;
    }
    visit(node, "heading", (heading: Heading) => {
      let id: string;
      if (depth > 0) {
        const first = heading.children[0]?.position?.start.offset;
        const last = heading.children.at(-1)?.position?.end.offset;
        id = kramdownHeaderID(first !== undefined && last !== undefined ? source.slice(first, last) : "", basic);
      } else {
        id = gfmHeaderID(toString(heading, { includeHtml: false }), gfm);
      }
      heading.data ??= {};
      heading.data.hProperties = { ...heading.data.hProperties, id };
    });
  }
};

/**
 * Kramdown definition lists:
 *
 *     term
 *     : definition
 *       continued
 *
 * CommonMark parses each group as a single paragraph, so this plugin splits
 * those paragraphs into `<dt>` and `<dd>` elements and merges adjacent groups.
 */
export const remarkDefinitionLists: Plugin<[], Root> = () => (tree) => {
  visit(tree, (node) => {
    if (!("children" in node) || node.type === "paragraph") return;
    const children = node.children as RootContent[];
    const result: RootContent[] = [];
    let changed = false;
    for (const child of children) {
      const previous = result.at(-1);
      const list = child.type === "paragraph" ? splitDefinitionParagraph(child) : undefined;
      if (list) {
        changed = true;
        if (previous && isDefinitionList(previous)) {
          (previous as unknown as { children: RootContent[] }).children.push(...list.items);
        } else {
          result.push(list.node);
        }
        continue;
      }
      // A paragraph that starts with `: ` after a list is another definition.
      if (child.type === "paragraph" && previous && isDefinitionList(previous) && startsWithColon(child)) {
        changed = true;
        stripLeadingColon(child);
        (previous as unknown as { children: RootContent[] }).children.push(element("dd", [child]));
        continue;
      }
      result.push(child);
    }
    if (changed) (node as { children: RootContent[] }).children = result;
  });
};

/** A block container, such as `<dl>` or a `<dd>` with paragraphs. */
function element(tagName: string, children: RootContent[]): RootContent {
  return {
    type: "blockquote",
    children: children as never,
    data: { hName: tagName, hProperties: {} },
  } as unknown as RootContent;
}

/** A term or definition with inline content, rendered without added line breaks. */
function inlineElement(tagName: "dt" | "dd", children: PhrasingContent[]): RootContent {
  return { type: "paragraph", children, data: { hName: tagName, hProperties: {} } } as RootContent;
}

function isDefinitionList(node: RootContent): boolean {
  return (node.data as { hName?: string } | undefined)?.hName === "dl";
}

function startsWithColon(paragraph: Paragraph): boolean {
  const first = paragraph.children[0];
  return first?.type === "text" && first.value.startsWith(": ");
}

function stripLeadingColon(paragraph: Paragraph): void {
  const first = paragraph.children[0] as Text;
  first.value = first.value.replace(/^: /, "");
}

/** Splits a paragraph's inline content into lines at newlines in text nodes. */
function lines(children: PhrasingContent[]): PhrasingContent[][] {
  const result: PhrasingContent[][] = [[]];
  for (const child of children) {
    if (child.type !== "text") {
      result.at(-1)!.push(child);
      continue;
    }
    const parts = child.value.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) result.push([]);
      if (part) result.at(-1)!.push({ type: "text", value: part });
    });
  }
  return result;
}

function splitDefinitionParagraph(paragraph: Paragraph): { node: RootContent; items: RootContent[] } | undefined {
  const split = lines(paragraph.children);
  const isDefinition = (line: PhrasingContent[]) => line[0]?.type === "text" && line[0].value.startsWith(": ");
  const firstDefinition = split.findIndex(isDefinition);
  if (firstDefinition < 1) return undefined;

  const items: RootContent[] = [];
  for (const term of split.slice(0, firstDefinition)) {
    items.push(inlineElement("dt", term));
  }
  let current: PhrasingContent[] | undefined;
  const flush = () => {
    if (current) items.push(inlineElement("dd", current));
  };
  for (const line of split.slice(firstDefinition)) {
    if (isDefinition(line)) {
      flush();
      const [head, ...rest] = line as [Text, ...PhrasingContent[]];
      current = [{ type: "text", value: head.value.replace(/^: /, "") }, ...rest];
    } else {
      current!.push({ type: "text", value: "\n" }, ...line);
    }
  }
  flush();
  return { node: { ...element("dl", []), children: items } as unknown as RootContent, items };
}

const escapeHTML = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeHTMLAttribute = (text: string) => escapeHTML(text).replace(/"/g, "&quot;");

/** Highlights fenced and indented code blocks, producing the site's code listing markup. */
export const remarkHighlightCode: Plugin<[], Root> = () => async (tree) => {
  const blocks: Array<{ node: Code; index: number; parent: { children: RootContent[] } }> = [];
  visit(tree, "code", (node: Code, index, parent) => {
    if (parent && index !== undefined) blocks.push({ node, index, parent: parent as { children: RootContent[] } });
  });
  for (const { node, index, parent } of blocks) {
    const fence = node.lang ?? undefined;
    const label = languageLabel(fence);
    // Replace each placeholder with one private-use character while highlighting.
    // Some grammars split an ASCII sentinel across several highlighted tokens.
    const placeholders: string[] = [];
    const source = node.value.replace(/<#\s*([\s\S]*?)\s*#>/g, (_, name: string) => {
      placeholders.push(name);
      return String.fromCodePoint(0xf0000 + placeholders.length - 1);
    });
    let code = await highlight(source, fence);
    placeholders.forEach((name, index) => {
      code = code.replace(String.fromCodePoint(0xf0000 + index), `<var class="placeholder">${escapeHTML(name)}</var>`);
    });
    const html: Html = {
      type: "html",
      value: `<pre class="highlight" data-lang="${escapeHTMLAttribute(label)}"><code>${code}</code></pre>`,
    };
    parent.children[index] = html;
  }
};

/**
 * Marks the headings that have IDs before Astro assigns IDs to the rest,
 * so that only Kramdown and explicit HTML IDs get anchors.
 */
export const rehypeMarkHeadingIds: Plugin<[], HastRoot> = () => (tree) => {
  visit(tree, "element", (node: Element) => {
    if (/^h[1-6]$/.test(node.tagName) && typeof node.properties.id === "string") {
      node.properties.dataKramdownId = "";
    }
  });
};

/**
 * The GFM syntax that Kramdown's GFM parser supported: tables, strikethrough, and footnotes.
 * Autolink literals are left out because Kramdown did not link bare URLs.
 */
export const remarkKramdownGfm: Plugin<[], Root> = function () {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(gfmTable(), gfmStrikethrough(), gfmFootnote());
  (data.fromMarkdownExtensions ??= []).push(
    gfmTableFromMarkdown(),
    gfmStrikethroughFromMarkdown(),
    gfmFootnoteFromMarkdown(),
  );
};

/**
 * Kramdown decided per list item whether to wrap the item's first paragraph in `<p>`,
 * where CommonMark decides for the whole list. Following Kramdown's list parser,
 * the first paragraph is unwrapped ("transparent") unless a blank line directly follows it.
 * The last item is unwrapped only if an earlier item was, or if the list has one item.
 */
export const remarkKramdownListItems: Plugin<[], Root> = () => (tree, file) => {
  const source = String(file.value);
  const blankBetween = (start: number | undefined, end: number | undefined) =>
    start !== undefined && end !== undefined && /\n[ \t]*\n/.test(source.slice(start, end));
  visit(tree, "list", (list: List) => {
    const transparent: boolean[] = [];
    list.children.forEach((item: ListItem, index) => {
      const first = item.children[0];
      const isLast = index === list.children.length - 1;
      let result = false;
      if (first?.type === "paragraph") {
        const following = item.children[1]?.position?.start.offset ?? list.children[index + 1]?.position?.start.offset;
        const blankAfterFirst = blankBetween(first.position?.end.offset, following);
        const onlyParagraph = item.children.length === 1;
        const firstCondition = isLast && onlyParagraph ? true : !blankAfterFirst;
        const lastCondition =
          !isLast ||
          list.children.length === 1 ||
          list.children
            .slice(0, -1)
            .some((other, otherIndex) => other.children[0]?.type !== "paragraph" || transparent[otherIndex]);
        result = firstCondition && lastCondition;
      }
      transparent.push(result);
      item.data = { ...item.data, kramdownTransparent: result } as ListItem["data"];
    });
  });
};

/** Renders list items, unwrapping the first paragraph when `remarkKramdownListItems` says to. */
const listItemHandler: Handler = (state, node, parent) => {
  const item = node as ListItem;
  const transparent = (item.data as { kramdownTransparent?: boolean } | undefined)?.kramdownTransparent;
  if (transparent === undefined) return defaultHandlers.listItem(state, item, parent);

  const results = state.all(item);
  const children: ElementContent[] = [];
  results.forEach((child, index) => {
    const unwrap = transparent && index === 0 && child.type === "element" && child.tagName === "p";
    if (!unwrap) children.push({ type: "text", value: "\n" });
    if (unwrap) children.push(...(child as Element).children);
    else children.push(child);
  });
  const tail = results.at(-1);
  if (tail && !(transparent && results.length === 1 && tail.type === "element" && tail.tagName === "p")) {
    children.push({ type: "text", value: "\n" });
  }
  const result: Element = { type: "element", tagName: "li", properties: {}, children };
  state.patch(item, result);
  return state.applyData(item, result);
};

/** The Unified processor used for Markdown in content collections. */
export function markdownProcessor() {
  return unifiedProcessor({
    gfm: false,
    smartypants: { dashes: "oldschool", backticks: false, ellipses: true, quotes: true },
    remarkPlugins: [
      remarkKramdownGfm,
      remarkKramdownListItems,
      remarkKramdownHeadingIds,
      remarkDefinitionLists,
      remarkHighlightCode,
    ],
    rehypePlugins: [rehypeRaw, rehypeMarkHeadingIds],
    remarkRehype: { allowDangerousHtml: true, handlers: { listItem: listItemHandler } },
  });
}

export type { VFile };
