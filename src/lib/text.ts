import { camelBreak } from "./render/liquid.ts";

export { camelBreak };

/**
 * Returns an article title, as HTML, with extra places where it can wrap on a narrow screen:
 * after a dot between identifiers, as in `Calendar.RecurrenceRule`,
 * and between an initialism and the word after it, as in `NSURLComponents`.
 * Each is a zero-width space in a `.narrow-break` element, which is shown only at widths
 * where the stylesheet allows it, so wide layouts keep their line breaks.
 * The camel-case breaks of `camelBreak` apply at every width, as before.
 */
export function titleHTML(input: string): string {
  const narrowBreak = '<span class="narrow-break">\u200b</span>';
  return escapeHTML(camelBreak(input))
    .replace(/(\w)\.(?=[A-Z])/g, `$1.${narrowBreak}`)
    .replace(/([A-Z]{2,})(?=[A-Z][a-z])/g, `$1${narrowBreak}`);
}

const escapeHTML = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Removes HTML tags, like Liquid's `strip_html`.
 * Line breaks become a single space so that words on either side stay apart.
 */
export function stripHTML(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s*<br\s*\/?>\s*/gi, " ")
    .replace(/<[^>]*>/g, "");
}

/** Decodes the character references that the Markdown renderer emits. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Plain text for a Markdown-rendered fragment, e.g. for a description. */
export function plainText(html: string): string {
  return decodeEntities(stripHTML(html)).trim();
}

/** Escapes text for XML content and attributes. */
export function escapeXML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Typographic quotes and dashes, like Jekyll's `smartify` filter. */
export function smartify(text: string): string {
  return text
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/\.\.\./g, "…")
    .replace(/(^|[\s([{"“])'/g, "$1‘")
    .replace(/'/g, "’")
    .replace(/(^|[\s([{‘])"/g, "$1“")
    .replace(/"/g, "”");
}
