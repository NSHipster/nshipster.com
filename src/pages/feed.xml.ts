import type { APIRoute } from "astro";
import { authorNamed, postsByUpdate } from "../lib/collections.ts";
import { site } from "../lib/site.ts";
import { escapeXML, smartify, stripHTML } from "../lib/text.ts";

/** The ten most recently published or revised articles, as an Atom feed. */
export const GET: APIRoute = async ({ site: origin }) => {
  const absolute = (path: string) => new URL(path, origin).href;
  const posts = (await postsByUpdate()).slice(0, 10);
  const updated = new Date();

  const entries = await Promise.all(
    posts.map(async (post) => {
      const { data } = post;
      const author = await authorNamed(data.author);
      const url = absolute(data.url);
      const categories = [data.category, ...data.tags].filter(Boolean);
      return `  <entry>
    <title type="html">${escapeXML(stripHTML(smartify(data.title)).replace(/\s+/g, " ").trim())}</title>
    <link href="${escapeXML(url)}" rel="alternate" type="text/html" title="${escapeXML(data.title)}" />
    <published>${data.date.toISOString()}</published>
    <updated>${data.updatedOn.toISOString()}</updated>
    <id>${escapeXML(absolute(`/${data.slug}`))}</id>
    <content type="html" xml:base="${escapeXML(url)}">${escapeXML((post.rendered?.html ?? "").trim())}</content>
    <author>
      <name>${escapeXML(author?.data.name ?? site.author.name)}</name>${
        (author ? author.data.email : site.author.email)
          ? `\n      <email>${escapeXML((author ? author.data.email : site.author.email)!)}</email>`
          : ""
      }
      <uri>${escapeXML(absolute(author?.data.url ?? site.author.url))}</uri>
    </author>
${categories.map((term) => `    <category term="${escapeXML(term)}" />`).join("\n")}
    <summary type="html">${escapeXML(data.excerptHTML.replace(/\s+/g, " ").trim())}</summary>
  </entry>`;
    }),
  );

  const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${site.lang}">
  <link href="${absolute("/feed.xml")}" rel="self" type="application/atom+xml" />
  <link href="${absolute("/")}" rel="alternate" type="text/html" hreflang="${site.lang}" />
  <updated>${updated.toISOString()}</updated>
  <id>${absolute("/feed.xml")}</id>
  <title>${escapeXML(site.title)}</title>
  <subtitle>NSHipster is a journal of the overlooked bits in Objective-C, Swift, and Cocoa.</subtitle>
  <author>
    <name>${escapeXML(site.author.name)}</name>
    <email>${escapeXML(site.author.email)}</email>
    <uri>${absolute(site.author.url)}</uri>
  </author>
${entries.join("\n")}
</feed>
`;
  return new Response(feed, { headers: { "Content-Type": "application/atom+xml; charset=utf-8" } });
};
