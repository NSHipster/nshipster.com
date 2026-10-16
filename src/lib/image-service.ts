import type { ExternalImageService } from "astro";
import { baseService } from "astro/assets";
import { isESMImportedImage } from "astro/assets/utils";
import { isTransformable, transformedImageURL } from "./image-transformations.ts";

/**
 * An Astro image service that links to Cloudflare Image Transformations
 * instead of making copies of images at build time.
 * The static-files integration uses it for builds when `IMAGE_TRANSFORMATIONS` is on.
 * Images that Cloudflare can't transform keep their original URL.
 */
const service: ExternalImageService = {
  ...baseService,
  validateOptions(options, imageConfig, logger) {
    // Cloudflare chooses AVIF or WebP for each browser unless a component asks for a format.
    options.format ??= "auto";
    return baseService.validateOptions!(options, imageConfig, logger);
  },
  getURL(options) {
    const src = isESMImportedImage(options.src) ? options.src.src : options.src;
    if (!src.startsWith("/") || src.startsWith("//") || !isTransformable(src)) return src;
    return transformedImageURL(src, {
      width: options.width,
      // Cloudflare's named quality levels differ from Astro's, so only numbers pass through.
      quality: typeof options.quality === "number" ? options.quality : undefined,
      format: options.format,
    });
  },
};

export default service;
