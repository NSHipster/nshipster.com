import { getCollection, type CollectionEntry } from "astro:content";
import { chronological } from "./content/posts.ts";

export type Post = CollectionEntry<"posts">;
export type Author = CollectionEntry<"authors">;

/** Published articles, oldest first, like Jekyll's `site.posts` reversed. */
export async function postsOldestFirst(): Promise<Post[]> {
  return chronological(await getCollection("posts"));
}

/** Published articles, newest first, like Jekyll's `site.posts`. */
export async function postsNewestFirst(): Promise<Post[]> {
  return (await postsOldestFirst()).reverse();
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

export async function authorNamed(name: string | undefined): Promise<Author | undefined> {
  if (!name) return undefined;
  return (await getCollection("authors")).find((author) => author.data.name === name);
}
