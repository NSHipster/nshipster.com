export { camelBreak } from "./render/liquid.ts";

/** Removes HTML tags, like Liquid's `strip_html`. */
export function stripHTML(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
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
