import { readFileSync } from "node:fs";
import path from "node:path";
import { Cite } from "@citation-js/core";
import "@citation-js/plugin-bibtex";
import "@citation-js/plugin-csl";
import { ROOT, paths } from "../site.ts";

/**
 * Formats `{% cite %}` and `{% bibliography --cited %}` tags
 * with Citation.js, using the APA style that Jekyll Scholar used.
 */

type Entry = { id: string } & Record<string, unknown>;

/**
 * Formats entries with a CSL template. The options are those of
 * `@citation-js/plugin-csl`, which the core package's types don't describe.
 */
function format(entry: Entry, style: "citation" | "bibliography", output: "text" | "html"): string {
  const cite = new Cite(entry);
  const formatter = cite.format.bind(cite) as unknown as (style: string, options: Record<string, string>) => string;
  return formatter(style, { template: "apa", format: output });
}

let entries: Map<string, Entry> | undefined;

function loadEntries(): Map<string, Entry> {
  if (entries) return entries;
  const file = path.join(ROOT, paths.bibliography);
  // The file starts with empty front matter so that Jekyll processes it.
  const source = readFileSync(file, "utf8").replace(/^---\s*\n---\s*\n/, "");
  const cite = new Cite(source);
  entries = new Map((cite.data as Entry[]).map((entry) => [entry.id, entry]));
  return entries;
}

/** Discards parsed entries so that bibliography changes are picked up. */
export function resetBibliography(): void {
  entries = undefined;
}

export class CitationError extends Error {}

function entry(key: string): Entry {
  const found = loadEntries().get(key);
  if (!found) throw new CitationError(`Unresolved citation "${key}"`);
  return found;
}

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** Tracks the citations in a single document, in the order they appear. */
export class CitationContext {
  readonly cited: string[] = [];

  cite(keys: string[]): string {
    return keys
      .map((key) => {
        const data = entry(key);
        if (!this.cited.includes(key)) this.cited.push(key);
        const text = format(data, "citation", "text");
        return `<a class="citation" href="#${escapeAttribute(key)}">${escapeText(text)}</a>`;
      })
      .join(" ");
  }

  bibliography(): string {
    const items = this.cited.map((key) => {
      const html = format(entry(key), "bibliography", "html");
      const body = html
        .replace(/^[\s\S]*?<div[^>]*class="csl-entry"[^>]*>/, "")
        .replace(/<\/div>\s*<\/div>\s*$/, "")
        .replace(/&#38;/g, "&amp;")
        .trim();
      return `<li><span id="${escapeAttribute(key)}">${body}</span></li>`;
    });
    return `<ol class="bibliography">${items.join("")}</ol>`;
  }
}

function escapeText(text: string): string {
  return text.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
