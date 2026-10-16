/**
 * Cloudflare Image Transformations resize images on this site and convert them to AVIF or WebP
 * for each browser, at `/cdn-cgi/image/<options>/<source>` URLs on the same origin.
 * https://developers.cloudflare.com/images/transform-images/transform-via-url/
 *
 * When this is on, article images list transformed copies in `srcset`
 * and Astro's image components use `src/lib/image-service.ts`.
 * When it is off, the build makes smaller copies of the images in `src/data/responsive-images.json` with sharp,
 * and Astro's sharp service processes author portraits.
 *
 * Turn this on only after enabling Transformations for the nshipster.com zone
 * (Images > Transformations in the Cloudflare dashboard).
 * Until then, `/cdn-cgi/image/` URLs return 404.
 */
export const IMAGE_TRANSFORMATIONS = false;

/**
 * Widths of the transformed copies of an image in `srcset`.
 * An image gets a copy at each width that is less than its own, and one at its own width.
 * Each source and set of options counts as one unique transformation a month.
 */
export const TRANSFORMED_WIDTHS = [400, 800, 1200, 1600] as const;

const PREFIX = "/cdn-cgi/image/";

/**
 * Whether Cloudflare can transform an image, by its file name.
 * It can't read TIFF files and doesn't resize SVG files.
 * GIF files stay as they are, because most of them are animations.
 */
export function isTransformable(pathname: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(pathname);
}

export interface TransformationOptions {
  width?: number | undefined;
  quality?: number | undefined;
  /** `auto` serves AVIF or WebP to browsers that accept them, and the original format to others. */
  format?: string | undefined;
}

/**
 * The URL of a transformed copy of an image on this site.
 * The image keeps its aspect ratio and is never made larger.
 * If Cloudflare can't transform it, as when the monthly allowance runs out,
 * the URL redirects to the original image.
 */
export function transformedImageURL(source: string, options: TransformationOptions = {}): string {
  if (!source.startsWith("/") || source.startsWith("//")) {
    throw new Error(`Cannot transform "${source}": the source must be a path on this site`);
  }
  const { width, quality, format = "auto" } = options;
  const parameters = Object.entries({ width, quality, format })
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}=${value}`);
  return `${PREFIX}${[...parameters, "onerror=redirect"].join(",")}${source}`;
}

/** The path of the original image for a transformed image URL, or the URL unchanged. */
export function transformationSource(url: string): string {
  if (!url.startsWith(PREFIX)) return url;
  const slash = url.indexOf("/", PREFIX.length);
  return slash === -1 ? url : url.slice(slash);
}
