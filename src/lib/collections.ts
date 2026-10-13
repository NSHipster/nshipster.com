import { getCollection, render, type CollectionEntry } from "astro:content";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import type { PostEntryData } from "./content/loaders.ts";
import { mdxPostData } from "./content/mdx.ts";
import { chronological } from "./content/posts.ts";
import { withCitations } from "./render/citations.ts";
import { site } from "./site.ts";

/** A published article, from either the legacy Markdown loader or Markdoc. */
export interface Post {
  data: PostEntryData;
  entry: CollectionEntry<"posts"> | CollectionEntry<"articles">;
  markdoc: boolean;
  /** Rendered HTML for legacy articles. Markdoc articles render through their component. */
  html?: string;
}

export type Author = CollectionEntry<"authors">;

let cached: Promise<Post[]> | undefined;

function allPosts(): Promise<Post[]> {
  cached ??= (async () => {
    const legacy: Post[] = (await getCollection("posts")).map((entry) => ({
      data: entry.data,
      entry,
      markdoc: false,
      html: entry.rendered?.html,
    }));
    const converted: Post[] = await Promise.all(
      (await getCollection("articles"))
        .filter((entry) => entry.data.published !== false)
        .map(async (entry) => ({
          data: await mdxPostData(entry, { commitHistory: true }),
          entry,
          markdoc: true,
        })),
    );
    const seen = new Set<string>();
    for (const post of [...legacy, ...converted]) {
      if (seen.has(post.data.slug)) {
        throw new Error(
          `Article slug "${post.data.slug}" exists in both Markdown and converted form; remove the old file when converting it.`,
        );
      }
      seen.add(post.data.slug);
    }
    return chronological([...legacy, ...converted]);
  })();
  return cached;
}

/** Published articles, oldest first, like Jekyll's `site.posts` reversed. */
export async function postsOldestFirst(): Promise<Post[]> {
  return allPosts();
}

/** Published articles, newest first, like Jekyll's `site.posts`. */
export async function postsNewestFirst(): Promise<Post[]> {
  return [...(await postsOldestFirst())].reverse();
}

/**
 * Sorts by a key like Liquid's `sort` followed by `reverse`:
 * ascending with ties in their original order, then reversed.
 */
export function sortedDescending<T>(items: T[], key: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => key(a.item) - key(b.item) || a.index - b.index)
    .map(({ item }) => item)
    .reverse();
}

/** Posts ordered by their latest revision, most recent first. */
export async function postsByUpdate(): Promise<Post[]> {
  return sortedDescending(await postsNewestFirst(), (post) => post.data.updatedOn.getTime());
}

let container: Promise<AstroContainer> | undefined;

/** The article body as HTML, for the feed. Markdoc articles render through the container API. */
export async function postHTML(post: Post): Promise<string> {
  if (!post.markdoc) return post.html ?? "";
  const { Content } = await render(post.entry as CollectionEntry<"articles">);
  container ??= AstroContainer.create({
    astroConfig: {
      site: site.url,
    },
  });
  const c = await container;
  return withCitations(() => c.renderToString(Content));
}

export async function authorNamed(name: string | undefined): Promise<Author | undefined> {
  if (!name) return undefined;
  return (await getCollection("authors")).find((author) => author.data.name === name);
}
