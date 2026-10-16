import type { AssetManifest, ImageSize, ImageVariant } from "../assets.ts";

/** The size and smaller copies of an image asset, for the HTML transformations. */
export interface ImageDescription extends ImageSize {
  variants: ImageVariant[];
}

/** Describes the images among a document's assets, keyed by their public URL. */
export async function describeImages(
  assets: AssetManifest,
  names: Iterable<string>,
): Promise<Map<string, ImageDescription>> {
  const images = new Map<string, ImageDescription>();
  for (const name of names) {
    const asset = assets.find(name);
    // `{% asset %}` links to a TIFF file rather than embedding it, but articles show them as images.
    if (!asset || (asset.kind !== "image" && !asset.logical.endsWith(".tiff"))) continue;
    const size = await assets.size(asset);
    if (!size) continue;
    images.set(assets.build(asset).url, { ...size, variants: await assets.variants(asset) });
  }
  return images;
}
