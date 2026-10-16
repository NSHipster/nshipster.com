import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { postsLoader } from "./lib/content/loaders.ts";
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
 * Front matter for glob-loaded MDX and Markdoc content.
 * The glob loader parses the values, and `mdxPostData` applies
 * the same normalization rules as the legacy post loader,
 * so most values stay untyped here and are coerced there.
 */
const globFrontmatter = z.object({
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
  /**
   * Whether a page uses the plain page layout, without the article byline and footer.
   * (MDX reserves the `layout` key for a layout component import.)
   */
  plain: z.boolean().optional(),
});

/**
 * Published articles from the submodule that have been converted to Markdoc.
 * They merge with the legacy Markdown posts everywhere articles are listed.
 */
const articles = defineCollection({
  loader: glob({ base: `./${paths.posts}`, pattern: "**/*.mdoc" }),
  schema: globFrontmatter,
});

/** Pages written in MDX, which use the article layout unless they set `plain: true`. */
const pages = defineCollection({
  loader: glob({ base: `./${paths.pages}`, pattern: "**/*.mdx" }),
  schema: globFrontmatter,
});

const authors = defineCollection({
  loader: glob({ base: `./${paths.authors}`, pattern: "**/*.md" }),
  schema: z
    .object({
      name: z.string(),
      title: z.string().optional(),
      email: z.string().optional(),
      url: z.string().optional(),
      twitter: z.string().optional(),
      github: z.string().optional(),
      image: z.string().optional(),
      gravatar: z.string().optional(),
    })
    .transform((data) => ({
      name: data.name,
      title: data.title ?? data.name,
      email: data.email,
      website: data.url,
      twitter: data.twitter,
      github: data.github,
      image: data.image,
      gravatar: data.gravatar,
    })),
});

const books = defineCollection({
  loader: glob({ base: `./${paths.books}`, pattern: "**/*.md" }),
  schema: z
    .object({
      name: z.string().optional(),
      title: z.string(),
      short_title: z.string().optional(),
      shortTitle: z.string().optional(),
      sub_title: z.string().optional(),
      subTitle: z.string().optional(),
      edition: z.string().optional(),
      author: z.string().optional(),
      summary: z.string(),
      image: z.string(),
      availability: z.string().optional(),
      book_url: z.string().optional(),
      bookURL: z.string().optional(),
      price: z.union([z.string(), z.number()]).optional(),
      number_of_pages: z.union([z.string(), z.number()]).optional(),
      numberOfPages: z.union([z.string(), z.number()]).optional(),
      category: z.string().optional(),
      isbn: z.string().optional(),
      date: z.coerce.string().optional(),
    })
    .transform((data) => ({
      name: data.name,
      title: data.title,
      shortTitle: data.shortTitle ?? data.short_title,
      subTitle: data.subTitle ?? data.sub_title,
      edition: data.edition,
      author: data.author,
      summary: data.summary,
      image: data.image,
      availability: data.availability,
      bookURL: data.bookURL ?? data.book_url,
      price: data.price !== undefined ? String(data.price) : undefined,
      numberOfPages:
        data.numberOfPages !== undefined
          ? String(data.numberOfPages)
          : data.number_of_pages !== undefined
            ? String(data.number_of_pages)
            : undefined,
      category: data.category,
      isbn: data.isbn,
      date: data.date,
    })),
});

export const collections = { posts, articles, pages, authors, books };
