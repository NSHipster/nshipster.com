import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { authorsLoader, booksLoader, postsLoader } from "./lib/content/loaders.ts";
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

/** Pages that use the article layout. */
const pages = defineCollection({
  loader: postsLoader({
    directory: ".",
    articles: false,
    files: [
      { file: "return.md", slug: "return" },
      { file: "flight-school.md", slug: "flight-school" },
    ],
  }),
  schema: post,
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

const books = defineCollection({
  loader: booksLoader(),
  schema: z.object({
    name: z.string(),
    title: z.string(),
    shortTitle: z.string().optional(),
    subTitle: z.string().optional(),
    edition: z.string().optional(),
    author: z.string().optional(),
    summary: z.string(),
    summaryHTML: z.string(),
    image: z.string(),
    availability: z.string().optional(),
    bookURL: z.string().optional(),
    price: z.string().optional(),
    numberOfPages: z.string().optional(),
    isbn: z.string().optional(),
    date: z.string().optional(),
  }),
});

export const collections = { posts, pages, authors, books };
