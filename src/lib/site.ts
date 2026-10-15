import { existsSync } from "node:fs";
import path from "node:path";

/**
 * The repository root: the nearest directory with `astro.config.ts`,
 * starting from the working directory. Bundled build chunks can't use
 * `import.meta.url` because they run from the output directory.
 */
export const ROOT = findRoot(process.cwd());

function findRoot(start: string): string {
  let directory = path.resolve(start);
  while (!existsSync(path.join(directory, "astro.config.ts"))) {
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`Cannot find the repository root from ${start}`);
    directory = parent;
  }
  return directory + path.sep;
}

export const site = {
  title: "NSHipster",
  url: "https://nshipster.com",
  lang: "en-US",
  timezone: "America/Los_Angeles",
  description: "**NSHipster** is a journal of the overlooked bits in Objective-C, Swift, and Cocoa.",
  twitter: "629523445",
  author: {
    name: "Mattt",
    email: "mattt@nshipster.com",
    url: "/authors/mattt",
  },
  /** Category order for the home page archive. */
  groups: ["Cocoa", "Swift", "Xcode", "Open Source", "Miscellaneous", "Trivia", "Objective-C"],
  articlesRepository: "https://github.com/NSHipster/articles",
  commitHistoryBase: "https://github.com/nshipster/articles/commits/master/",
} as const;

export const paths = {
  /** Where the build downloads `NSHipster/articles`; see `src/lib/content/articles.ts`. */
  articles: "node_modules/.astro/articles",
  authors: "src/content/authors",
  books: "src/content/books",
  pages: "src/content/pages",
  bibliography: "_bibliography/references.bib",
  assets: "assets",
} as const;

export function absoluteURL(path: string): string {
  if (/^[a-z]+:\/\//i.test(path)) return path;
  return site.url + (path.startsWith("/") ? path : `/${path}`);
}
