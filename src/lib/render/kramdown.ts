import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkSmartypants from "remark-smartypants";
import { unified } from "unified";

/**
 * Source-level adjustments that make CommonMark parse Kramdown-flavored articles
 * the way Kramdown did. Each adjustment applies outside fenced code blocks.
 */

/** Block-level elements whose content Kramdown parsed as Markdown. */
const MARKDOWN_BLOCK_ELEMENTS = [
  "aside",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "figure",
  "figcaption",
  "details",
  "blockquote",
  "center",
  "address",
];

/** Block-level tags that start a raw HTML block in CommonMark. */
const HTML_BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "center",
  "details",
  "dialog",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
  "picture",
  "video",
  "samp",
]);

const FENCE = /^(\s*(?:>\s?)*)(`{3,}|~{3,})/;

/** Sentinel text for the empty header row of a header-less table. */
export const EMPTY_HEADER = "\uE002";

interface Line {
  text: string;
  /** Whether the line is inside (or delimits) a fenced code block. */
  code: boolean;
}

function classify(lines: string[]): Line[] {
  const result: Line[] = [];
  let fence: string | undefined;
  for (const text of lines) {
    const match = text.match(FENCE);
    if (fence) {
      result.push({ text, code: true });
      if (
        match &&
        match[2]!.startsWith(fence[0]!) &&
        match[2]!.length >= fence.length &&
        !text.slice(match[0].length).trim()
      ) {
        fence = undefined;
      }
    } else if (match) {
      fence = match[2]!;
      result.push({ text, code: true });
    } else {
      result.push({ text, code: false });
    }
  }
  return result;
}

/**
 * A fenced code block that starts inside a block quote continues
 * on lines without the `>` marker, as Kramdown allowed.
 */
export function continueQuotedFences(lines: string[]): string[] {
  const result: string[] = [];
  let fence: { marker: string; prefix: string } | undefined;
  for (const line of lines) {
    if (fence) {
      const bare = line.replace(/^\s*>\s?/, "");
      result.push(line.match(/^\s*>/) ? line : `${fence.prefix}${line}`);
      if (bare.trim().startsWith(fence.marker) && !bare.trim().slice(fence.marker.length).trim()) fence = undefined;
      continue;
    }
    const match = line.match(/^(\s*>\s?)(`{3,}|~{3,})/);
    if (match) fence = { marker: match[2]!, prefix: match[1]! };
    result.push(line);
  }
  return result;
}

/** Kramdown allowed spaces in link destinations, which CommonMark requires to be in angle brackets. */
export function linkDestinationsWithSpaces(lines: Line[]): void {
  for (const line of lines) {
    if (line.code) continue;
    line.text = line.text.replace(/\]\(([^()<>"\s]+(?: [^()<>"\s]+)+)\)/g, "](<$1>)");
  }
}

/** Kramdown's `\\` at the end of a line is a hard line break. */
export function hardLineBreaks(lines: Line[]): void {
  for (const line of lines) {
    if (!line.code) line.text = line.text.replace(/(?<!\\)\\\\[ \t]*$/, "\\");
  }
}

/**
 * Kramdown allows tables without a header row.
 * An empty header row is added so that GFM parses them;
 * the HTML stage removes it.
 */
export function headerlessTables(lines: Line[]): Line[] {
  const result: Line[] = [];
  const isRow = (line: Line | undefined) => !!line && !line.code && /^\s*\|.*\|\s*$/.test(line.text);
  const isSeparator = (line: Line | undefined) =>
    !!line && /^\s*\|?\s*:?-{2,}/.test(line.text) && /^[\s|:\-+]+$/.test(line.text);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const startsTable = isRow(line) && !isRow(lines[index - 1]) && !isSeparator(lines[index - 1]);
    if (startsTable && !isSeparator(lines[index + 1])) {
      const columns = line.text
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|").length;
      const indent = line.text.match(/^\s*/)![0];
      if (result.length > 0 && result.at(-1)!.text.trim() !== "") result.push({ text: "", code: false });
      result.push({ text: `${indent}|${` ${EMPTY_HEADER} |`.repeat(columns)}`, code: false });
      result.push({ text: `${indent}|${" --- |".repeat(columns)}`, code: false });
    }
    result.push(line);
  }
  return result;
}

const indentation = (text: string) => text.match(/^\s*/)![0].length;

/**
 * Kramdown parsed Markdown inside block-level HTML elements.
 * CommonMark only does so after a blank line, so blank lines are added
 * after opening tags and before closing tags that are alone on their lines.
 * Content indented far enough to become a code block is outdented.
 * Elements nested in other HTML, such as table cells, are left alone.
 * `<p>` elements that span lines become Markdown paragraphs.
 */
export function openHTMLBlocks(lines: Line[]): Line[] {
  const tags = MARKDOWN_BLOCK_ELEMENTS.join("|");
  const opening = new RegExp(`^(\\s*)<(${tags})(\\s[^>]*)?>\\s*$`, "i");
  const result: Line[] = [...lines];

  for (let index = 0; index < result.length; index++) {
    const line = result[index]!;
    if (line.code) continue;

    const paragraph = line.text.match(/^(\s*)<p>(.*)$/);
    if (paragraph) {
      let end = index;
      while (end < result.length && !/<\/p>\s*$/.test(result[end]!.text)) {
        if (result[end]!.code || (end > index && result[end]!.text.trim() === "")) break;
        end++;
      }
      if (end < result.length && /<\/p>\s*$/.test(result[end]!.text) && !result[end]!.code) {
        result[end] = { text: result[end]!.text.replace(/<\/p>\s*$/, ""), code: false };
        result[index] = { text: result[index]!.text.replace(/^(\s*)<p>/, "$1"), code: false };
        result.splice(end + 1, 0, { text: "", code: false });
        result.splice(index, 0, { text: "", code: false });
        index++;
      }
      continue;
    }

    // Only elements at the top level are opened: a blank line inside
    // an enclosing HTML block would end that block early, and one inside
    // a list item would make the list loose.
    const match = line.text.match(opening);
    if (!match || match[1]!.length > 0) continue;
    const tag = match[2]!.toLowerCase();
    const next = result[index + 1];
    const startsWithSpan = new RegExp(`^\\s*<(?:${SPAN_ELEMENTS})\\b`, "i").test(next?.text ?? "");
    if (!next || next.code || next.text.trim() === "" || (/^\s*</.test(next.text) && !startsWithSpan)) continue;

    // Find the matching closing tag alone on its line.
    let depth = 0;
    let close = -1;
    for (let cursor = index; cursor < result.length; cursor++) {
      const text = result[cursor]!.text;
      if (result[cursor]!.code) continue;
      depth += (text.match(new RegExp(`<${tag}(\\s[^>]*)?>`, "gi")) ?? []).length;
      depth -= (text.match(new RegExp(`</${tag}>`, "gi")) ?? []).length;
      if (depth === 0) {
        close = cursor;
        break;
      }
    }
    if (close < 0 || !new RegExp(`^\\s*</${tag}>\\s*$`, "i").test(result[close]!.text)) continue;

    const base = indentation(line.text);
    const content = result.slice(index + 1, close).filter((entry) => entry.text.trim() !== "");
    const minimum = Math.min(...content.map((entry) => indentation(entry.text)));
    if (Number.isFinite(minimum) && minimum - base >= 4) {
      const outdent = minimum - base;
      for (let cursor = index + 1; cursor < close; cursor++) {
        const entry = result[cursor]!;
        result[cursor] = { ...entry, text: entry.text.slice(Math.min(outdent, indentation(entry.text))) };
      }
    }
    if (result[close - 1]!.text.trim() !== "") result.splice(close, 0, { text: "", code: false });
    result.splice(index + 1, 0, { text: "", code: false });
  }
  return result;
}

const inlineProcessor = unified()
  .use(remarkParse)
  .use(remarkSmartypants, { dashes: "oldschool", backticks: false })
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeStringify, { allowDangerousHtml: true });

/** Renders inline Markdown, such as code spans and links, to HTML. */
export function renderInline(markdown: string): string {
  const leading = markdown.match(/^\s*/)![0];
  const trailing = markdown.match(/\s*$/)![0];
  const html = String(inlineProcessor.processSync(markdown.trim())).trim();
  return leading + html.replace(/^<p>([\s\S]*)<\/p>$/, "$1") + trailing;
}

const INLINE_MARKDOWN = /`[^`]+`|\*\*[^*]+\*\*|(?:^|\s)_[^_\s][^_]*_(?=\s|$|[.,;:!?)])|\[[^\]]+\]\([^)]+\)/;

/**
 * Kramdown parsed inline Markdown in the text of HTML elements,
 * such as `<dt>`code`</dt>`, which CommonMark leaves as raw HTML.
 * Text between tags in raw HTML blocks is rendered as inline Markdown.
 * `<samp>` content is shown literally, as Kramdown did.
 */
export function inlineMarkdownInHTML(lines: Line[]): void {
  let inBlock = false;
  let literal: string | undefined;
  let paragraphStart = false;
  let paragraph: Line | undefined;
  const closeParagraph = () => {
    if (paragraph) paragraph.text += "</p>";
    paragraph = undefined;
    paragraphStart = false;
  };
  for (const line of lines) {
    if (line.code || line.text.trim() === "") {
      closeParagraph();
      inBlock = false;
      continue;
    }
    const start = line.text.match(/^\s{0,3}<\/?([a-zA-Z][\w-]*)/);
    if (!inBlock && start && HTML_BLOCK_TAGS.has(start[1]!.toLowerCase())) inBlock = true;
    if (!inBlock) continue;

    if (/^\s*<(pre|script|style)\b/i.test(line.text)) {
      literal = "raw";
    }
    if (literal === "raw") {
      if (/<\/(pre|script|style)>/i.test(line.text)) literal = undefined;
      continue;
    }
    if (/^\s*<samp>\s*$/i.test(line.text)) {
      literal = "samp";
      continue;
    }
    if (literal === "samp") {
      if (/^\s*<\/samp>\s*$/i.test(line.text)) literal = undefined;
      else line.text = escapeLiteral(line.text);
      continue;
    }

    // Text lines inside a container element, like `<dd>`, form a paragraph.
    if (/^\s*<(dd|li|div|aside|section|blockquote|figcaption|details)(\s[^>]*)?>\s*$/i.test(line.text)) {
      paragraphStart = true;
      continue;
    }
    const isText = !/^\s*</.test(line.text);
    if (isText && paragraphStart) {
      line.text = line.text.replace(/^(\s*)/, "$1<p>");
      paragraph = line;
    } else if (!isText && paragraph) {
      paragraph.text += "</p>";
      paragraph = undefined;
    } else if (isText && paragraph) {
      paragraph = line;
    }
    paragraphStart = false;

    // Render text segments outside tags, skipping the content of `<code>` elements.
    let insideCode = false;
    line.text = line.text.replace(/(<[^>]+>)|([^<]+)/g, (whole, tag: string | undefined, text: string | undefined) => {
      if (tag) {
        if (/^<code\b/i.test(tag)) insideCode = true;
        if (/^<\/code>/i.test(tag)) insideCode = false;
        return tag;
      }
      if (insideCode || !text || !INLINE_MARKDOWN.test(text)) return whole;
      return renderInline(text);
    });
  }
}

const PHRASING_TAGS = "a|abbr|b|br|code|del|em|i|ins|kbd|mark|q|s|small|span|strong|sub|sup|u|var|wbr";

/** Escapes text shown literally, keeping phrasing HTML elements such as `<br>`. */
function escapeLiteral(text: string): string {
  const tag = new RegExp(`^</?(?:${PHRASING_TAGS})(?:\\s[^<>]*)?/?>`, "i");
  let result = "";
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    const rest = text.slice(index);
    const match = character === "<" ? rest.match(tag) : null;
    if (match) {
      result += match[0];
      index += match[0].length - 1;
    } else if (character === "&" && /^&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i.test(rest)) {
      result += character;
    } else {
      result += character === "<" ? "&lt;" : character === ">" ? "&gt;" : character === "&" ? "&amp;" : character;
    }
  }
  return result;
}

/** Elements that Kramdown treated as span-level. */
const SPAN_ELEMENTS =
  "a|abbr|acronym|b|big|bdo|br|button|cite|code|del|dfn|em|i|img|input|ins|kbd|label|mark|q|ruby|s|samp|small|span|strike|strong|sub|sup|tt|u|var";

/**
 * Kramdown wrapped a block that starts with a span-level element, such as a lone `<img>`,
 * in a paragraph. CommonMark leaves a line with only a tag as raw HTML,
 * so these blocks are wrapped in `<p>` explicitly.
 */
export function wrapInlineHTMLBlocks(lines: Line[]): Line[] {
  const start = new RegExp(`^\\s{0,3}</?(?:${SPAN_ELEMENTS})(?:\\s[^>]*)?/?>\\s*$`, "i");
  const result: Line[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const previous = lines[index - 1];
    if (line.code || !start.test(line.text) || (previous && previous.text.trim() !== "")) {
      result.push(line);
      continue;
    }
    let end = index;
    while (end + 1 < lines.length && lines[end + 1]!.text.trim() !== "" && !lines[end + 1]!.code) end++;
    result.push({ text: "<p>", code: false }, ...lines.slice(index, end + 1), { text: "</p>", code: false });
    index = end;
  }
  return result;
}

/** Applies all adjustments to an article's Markdown source. */
export function preprocessKramdown(source: string): string {
  const lines = classify(continueQuotedFences(source.split("\n")));
  hardLineBreaks(lines);
  linkDestinationsWithSpaces(lines);
  const opened = wrapInlineHTMLBlocks(openHTMLBlocks(headerlessTables(lines)));
  inlineMarkdownInHTML(opened);
  return opened.map((line) => line.text).join("\n");
}
