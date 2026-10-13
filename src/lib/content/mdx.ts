import type { CollectionEntry } from "astro:content";
import { plainText } from "../text.ts";
import { renderFragment } from "../render/index.ts";
import { processorRenderer } from "../render/renderer.ts";
import type { PostEntryData } from "./loaders.ts";
import { normalizePost } from "./posts.ts";
import type { ParsedDocument } from "./frontmatter.ts";

/**
 * Normalizes an MDX entry from the glob loader into the post data
 * that the article layout uses, applying the same front matter rules
 * as the legacy Markdown loader.
 */
export async function mdxPostData(entry: CollectionEntry<"pages">): Promise<PostEntryData> {
  const data = entry.data as Record<string, unknown>;
  const document: ParsedDocument = {
    data,
    body: entry.body ?? "",
    // Glob entries do not expose front matter scalars as written,
    // so MDX files quote values that must keep their written form, such as `swift: "5.0"`.
    source: () => undefined,
  };
  const post = normalizePost(document, {
    file: entry.filePath ?? `${entry.id}.mdx`,
    slug: entry.id,
    commitHistory: false,
  });
  const render = await processorRenderer();
  const excerptHTML = await renderFragment(post.excerpt, render);
  return { ...post, excerptHTML, description: plainText(excerptHTML), citations: [] };
}
