import type { ImageMetadata } from "astro";

const images = import.meta.glob<{ default: ImageMetadata }>("/assets/images/*.{jpg,jpeg,png,gif,svg,webp}", {
  eager: true,
});

/** Returns an image from `assets/images` for use with Astro's image components. */
export function layoutImage(name: string): ImageMetadata {
  const image = images[`/assets/images/${name}`];
  if (!image) throw new Error(`Missing layout image "${name}"`);
  return image.default;
}
