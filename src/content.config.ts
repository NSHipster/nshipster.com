import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { authorsLoader, postsLoader } from "./lib/content/loaders.ts";
import { paths } from "./lib/site.ts";

const post = z.object({
  slug: z.string(),
  url: z.string(),
  title: z.string(),
  date: z.date(),
  lastRevisedOn: z.date().optional(),
  updatedOn: z.date(),
  revisions: z.array(z.object({ date: z.string(), description: z.string() })),
  author: z.string().optional(),
  authors: z.array(z.string()),
  category: z.string(),
  tags: z.array(z.string()),
  excerpt: z.string(),
  excerptHTML: z.string(),
  description: z.string(),
  status: z.object({ swift: z.string().optional(), reviewed: z.string().optional() }).optional(),
  retired: z.boolean(),
  sourcePath: z.string(),
  commitHistoryURL: z.string().optional(),
  citations: z.array(z.string()),
});

/** Published articles from the `NSHipster/articles` submodule. */
const posts = defineCollection({
  loader: postsLoader({ directory: paths.posts, articles: true }),
  schema: post,
});

/**
 * Front matter for MDX content.
 * The glob loader parses the values, and `mdxPostData` applies
 * the same normalization rules as the legacy post loader,
 * so most values stay untyped here and are coerced there.
 */
const mdxFrontmatter = z.object({
  title: z.string(),
  date: z.unknown().optional(),
  author: z.unknown().optional(),
  authors: z.unknown().optional(),
  category: z.unknown().optional(),
  tag: z.unknown().optional(),
  tags: z.unknown().optional(),
  excerpt: z.unknown().optional(),
  revisions: z.unknown().optional(),
  status: z.unknown().optional(),
  retired: z.unknown().optional(),
  published: z.unknown().optional(),
});

/**
 * Published articles from the submodule that have been converted to MDX.
 * They merge with the legacy Markdown posts everywhere articles are listed.
 */
const articles = defineCollection({
  loader: glob({ base: `./${paths.posts}`, pattern: "**/*.mdx" }),
  schema: mdxFrontmatter,
});

/** Pages that use the article layout, written in MDX. */
const pages = defineCollection({
  loader: glob({ base: `./${paths.pages}`, pattern: "**/*.mdx" }),
  schema: mdxFrontmatter,
});

const authors = defineCollection({
  loader: authorsLoader(),
  schema: z.object({
    slug: z.string(),
    url: z.string(),
    title: z.string(),
    name: z.string(),
    email: z.string().optional(),
    website: z.string().optional(),
    twitter: z.string().optional(),
    github: z.string().optional(),
    image: z.string().optional(),
    gravatar: z.string().optional(),
    bioHTML: z.string(),
    description: z.string(),
  }),
});

// Books in `src/content/books` have no pages of their own.
// The article render pipeline reads them directly for the `book.html` include,
// so they are not a content collection.
export const collections = { posts, articles, pages, authors };
