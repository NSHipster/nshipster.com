import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { postsNewestFirst } from "../lib/collections.ts";
import { xmlschema, zoned } from "../lib/dates.ts";
import { absoluteURL, site } from "../lib/site.ts";
import { escapeXML } from "../lib/text.ts";

export const GET: APIRoute = async () => {
  const posts = await postsNewestFirst();
  const authors = (await getCollection("authors")).sort((a, b) => (a.id < b.id ? -1 : 1));
  const newest = posts[0];

  const urls = [
    `  <url>
    <loc>${site.url}</loc>${newest ? `\n    <lastmod>${xmlschema(zoned(newest.data.date))}</lastmod>` : ""}
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`,
    ...posts
      .filter((post) => !post.data.retired)
      .map(
        (post) => `  <url>
    <loc>${escapeXML(absoluteURL(post.data.url))}</loc>
    <lastmod>${xmlschema(zoned(post.data.updatedOn))}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.9</priority>
  </url>`,
      ),
    ...authors.map(
      (author) => `  <url>
    <loc>${escapeXML(absoluteURL(author.data.url))}</loc>
  </url>`,
    ),
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
  return new Response(sitemap, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
