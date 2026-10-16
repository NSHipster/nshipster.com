import { getCollection, render, type CollectionEntry } from "astro:content";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import type { PostEntryData } from "./content/loaders.ts";
import { mdxPostData } from "./content/mdx.ts";
import { cardTitle, type OgCard } from "./og-image.ts";
import { chronological } from "./content/posts.ts";
import { withCitations } from "./render/citations.ts";
import { renderFragment } from "./render/index.ts";
import { processorRenderer } from "./render/renderer.ts";
import { site } from "./site.ts";
import { decodeEntities, plainText, stripHTML } from "./text.ts";

/** A published article, from either the legacy Markdown loader or Markdoc. */
export interface Post {
  data: PostEntryData;
  entry: CollectionEntry<"posts"> | CollectionEntry<"articles">;
  markdoc: boolean;
  /** Rendered HTML for legacy articles. Markdoc articles render through their component. */
  html?: string;
}

export type Author = CollectionEntry<"authors">;
export type Book = CollectionEntry<"books">;

/** Canonical path for an author profile. */
export function authorURL(author: Author | string): string {
  const id = typeof author === "string" ? author : author.id;
  return `/authors/${id}`;
}

/** Schema.org `Person` for an author, with their profile URL and linked accounts. */
export function authorPerson(author: Author) {
  const { name, website, twitter, github } = author.data;
  const links = [website, twitter && `https://twitter.com/${twitter}`, github && `https://github.com/${github}`];
  const sameAs = [...new Set(links.filter((link): link is string => Boolean(link)))];
  return {
    "@type": "Person",
    name,
    url: new URL(authorURL(author), site.url).href,
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

/** Plain text biography description from the first paragraph of an author's Markdown body. */
export async function authorDescription(author: Author): Promise<string> {
  const firstParagraph = author.body?.trim().split(/\n\s*\n/)[0] ?? "";
  return plainText(await renderFragment(firstParagraph, await processorRenderer()));
}

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

/**
 * The names that an article's byline credits.
 * Some older articles credit coauthors only in `author`, as in "Nate Cook, Mattt".
 */
export function creditedNames(post: PostEntryData): string[] {
  return post.authors.length > 0 ? post.authors : (post.author ?? "Mattt").split(/\s*[,&]\s*/);
}

/** The text that an article's Open Graph image shows. */
export async function postCard(post: PostEntryData): Promise<OgCard> {
  return {
    kind: "article",
    title: cardTitle(decodeEntities(stripHTML(post.title))),
    category: post.category,
    authors: await Promise.all(creditedNames(post).map(async (name) => (await authorNamed(name))?.data.name ?? name)),
  };
}
