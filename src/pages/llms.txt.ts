import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { authorDescription, authorURL, postsNewestFirst, type Post } from "../lib/collections.ts";
import { mdxPostData } from "../lib/content/mdx.ts";
import { byCodeUnit } from "../lib/content/posts.ts";
import { markdownPath } from "../lib/markdown-alternate.ts";
import { site } from "../lib/site.ts";
import { plainText } from "../lib/text.ts";

/**
 * An index of the site for agents, following https://llmstxt.org.
 * It lists the same articles as the sitemap, linking to their Markdown versions,
 * grouped by category in the order of the home page archive.
 */
export const GET: APIRoute = async ({ site: origin }) => {
  const absolute = (path: string) => new URL(path, origin).href;
  const posts = (await postsNewestFirst()).filter((post) => !post.data.retired);
  const authors = (await getCollection("authors")).sort((a, b) => (a.id < b.id ? -1 : 1));
  const pages = await Promise.all(
    (await getCollection("pages"))
      .filter((entry) => entry.data.published !== false)
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((entry) => mdxPostData(entry)),
  );

  // Categories that aren't in the archive, like Reader Submissions, follow it.
  const categories = [...new Set([...site.groups, ...posts.map((post) => post.data.category)])];
  const sections = categories
    .map((category) => ({
      category,
      posts: posts
        .filter((post) => post.data.category === category)
        .sort((a, b) => byCodeUnit(a.data.title, b.data.title)),
    }))
    .filter(({ posts }) => posts.length > 0);

  const item = (title: string, path: string, description?: string) =>
    `- [${linkText(title)}](${absolute(path)})${description ? `: ${oneLine(description)}` : ""}`;
  const article = (post: Post) => item(plainText(post.data.title), markdownPath(post.data.url), post.data.description);

  const lines = [
    `# ${site.title}`,
    "",
    "> NSHipster is a journal of the overlooked bits in Objective-C, Swift, and Cocoa.",
    "",
    "NSHipster has published articles about Apple platform development since 2012. " +
      "Articles cover Swift and Objective-C language features, Foundation and Cocoa APIs, Xcode, " +
      "and developer tools. Some older articles describe APIs that Apple has since deprecated or replaced; " +
      "each article gives its publication and revision dates.",
    "",
    `Each article has a Markdown version at its URL with \`.md\` appended, such as ${absolute("/nscache.md")} ` +
      `for ${absolute("/nscache")}. The links below go to these Markdown versions.`,
    "",
    "NSHipster articles are released under the Creative Commons Attribution-NonCommercial 4.0 License " +
      "(https://creativecommons.org/licenses/by-nc/4.0/), " +
      "which permits sharing and adapting them for non-commercial purposes with attribution.",
    ...sections.flatMap(({ category, posts }) => ["", `## ${category}`, "", ...posts.map(article)]),
    "",
    "## Optional",
    "",
    ...pages.filter((page) => !page.retired).map((page) => item(page.title, markdownPath(page.url), page.description)),
    item("Article Status", "/status", "When each article was last reviewed, and the Swift version it uses."),
    item("Atom Feed", "/feed.xml", "The ten most recently published or revised articles."),
    item("Sitemap", "/sitemap.xml", "The pages of every article and author."),
    ...(await Promise.all(
      authors.map(async (author) => item(author.data.name, authorURL(author), await authorDescription(author))),
    )),
    "",
  ];

  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};

/** Escapes the characters that would end or format a Markdown link's text. */
const linkText = (text: string) => oneLine(text).replace(/[\\[\]*_`]/g, "\\$&");

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();
