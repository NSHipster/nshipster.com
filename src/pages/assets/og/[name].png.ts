import type { APIRoute, GetStaticPaths } from "astro";
import { postCard, postsOldestFirst } from "../../../lib/collections.ts";
import { SITE_CARD, SITE_CARD_SLUG, ogImageName, renderOgImage, type OgCard } from "../../../lib/og-image.ts";

const rendered = new Map<string, Promise<Buffer>>();

function render(name: string, card: OgCard): Promise<Buffer> {
  let png = rendered.get(name);
  if (!png) {
    png = renderOgImage(card);
    // A failure is reported when the build requests the image.
    png.catch(() => {});
    rendered.set(name, png);
  }
  return png;
}

/** The Open Graph image of each article, and the one for the other pages. */
export const getStaticPaths = (async () => {
  const cards: Array<readonly [string, OgCard]> = [
    [SITE_CARD_SLUG, SITE_CARD],
    ...(await Promise.all(
      (await postsOldestFirst()).map(async (post) => [post.data.slug, await postCard(post.data)] as const),
    )),
  ];
  const slugs = new Set<string>();
  const paths = cards.map(([slug, card]) => {
    if (slugs.has(slug)) throw new Error(`More than one Open Graph image has the slug "${slug}"`);
    slugs.add(slug);
    return { params: { name: ogImageName(slug, card) }, props: { card } };
  });
  // Astro builds one path at a time.
  // Starting every render now lets Sharp encode the images in parallel.
  if (!import.meta.env.DEV) for (const { params, props } of paths) void render(params.name, props.card);
  return paths;
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ card: OgCard }, { name: string }> = async ({ params, props }) =>
  new Response(new Uint8Array(await render(params.name, props.card)), { headers: { "Content-Type": "image/png" } });
