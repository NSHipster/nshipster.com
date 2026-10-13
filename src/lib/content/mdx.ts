import path from "node:path";
import { plainText } from "../text.ts";
import { renderFragment } from "../render/index.ts";
import { processorRenderer } from "../render/renderer.ts";
import type { PostEntryData } from "./loaders.ts";
import { normalizePost, parsePostFilename } from "./posts.ts";
import type { ParsedDocument } from "./frontmatter.ts";

/** The parts of a glob-loaded entry that normalization needs. */
export interface GlobEntry {
  id: string;
  data: object;
  body?: string;
  filePath?: string;
}

/**
 * Normalizes an MDX or Markdoc entry from a glob loader into the post data
 * that the article layout uses, applying the same front matter rules
 * as the legacy Markdown loader.
 */
export async function mdxPostData(
  entry: GlobEntry,
  options: { commitHistory: boolean } = { commitHistory: false },
): Promise<PostEntryData> {
  const file = entry.filePath ?? (entry.id.includes(".") ? entry.id : `${entry.id}.mdx`);
  const data = { ...(entry.data as Record<string, unknown>) };
  // YAML parsers widen unquoted revision dates used as mapping keys to instants
  // at midnight UTC, stringified in the build machine's time zone.
  // Recover the written calendar date so normalization does not shift it a day earlier.
  if (data.revisions && typeof data.revisions === "object") {
    data.revisions = Object.fromEntries(
      Object.entries(data.revisions as Record<string, unknown>).map(([date, description]) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return [date, description];
        const parsed = Date.parse(date);
        return [Number.isNaN(parsed) ? date : new Date(parsed).toISOString().slice(0, 10), description];
      }),
    );
  }
  // Timestamp values in the status mapping arrive as instants at midnight UTC for the same reason.
  if (data.status && typeof data.status === "object") {
    data.status = Object.fromEntries(
      Object.entries(data.status as Record<string, unknown>).map(([key, value]) => [
        key,
        value instanceof Date ? value.toISOString().slice(0, 10) : value,
      ]),
    );
  }
  const document: ParsedDocument = {
    data,
    body: entry.body ?? "",
    // Glob entries do not expose front matter scalars as written,
    // so converted files quote values that must keep their written form, such as `swift: "5.0"`.
    source: () => undefined,
  };
  const post = normalizePost(document, {
    file,
    // Article file names encode the slug after their date; page file names are the slug.
    slug: parsePostFilename(file)?.slug ?? path.basename(entry.id),
    commitHistory: options.commitHistory,
  });
  const render = await processorRenderer();
  const excerptHTML = await renderFragment(post.excerpt, render);
  return { ...post, excerptHTML, description: plainText(excerptHTML), citations: [] };
}
