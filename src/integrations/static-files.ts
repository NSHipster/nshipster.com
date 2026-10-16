import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { AssetManifest } from "../lib/assets.ts";
import { pageMarkdown, pageURL } from "../lib/markdown-alternate.ts";
import { ROOT, paths } from "../lib/site.ts";
import { headers, redirects } from "./routing.ts";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".tiff": "image/tiff",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".srt": "text/plain; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".zip": "application/zip",
};

/**
 * Publishes `assets/` with content-hashed names under `/assets/`,
 * along with WebP copies of PNG, JPEG, and WebP images,
 * writes the Markdown versions of articles that their pages link to,
 * and writes Cloudflare routing files.
 * Files served as-is from the site root live in `public/`.
 */
export function staticFiles(): AstroIntegration {
  return {
    name: "nshipster:static-files",
    hooks: {
      "astro:config:setup": ({ updateConfig, command }) => {
        if (command !== "dev") return;
        let manifest: AssetManifest | undefined;
        let outputs: Map<string, { contents: Buffer }> | undefined;
        updateConfig({
          vite: {
            plugins: [
              {
                name: "nshipster:static-files-dev",
                configureServer(server) {
                  server.watcher.add(path.join(ROOT, paths.assets));
                  server.watcher.on("all", (_event, file) => {
                    if (file.startsWith(path.join(ROOT, paths.assets))) {
                      manifest = undefined;
                      outputs = undefined;
                    }
                  });
                  server.middlewares.use((request, response, next) => {
                    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
                    const send = (contents: Buffer | undefined) => {
                      if (!contents) return next();
                      response.setHeader(
                        "Content-Type",
                        CONTENT_TYPES[path.extname(pathname)] ?? "application/octet-stream",
                      );
                      response.end(contents);
                    };
                    if (pathname.endsWith(".md")) {
                      // Convert the page as the build does, if it links to this Markdown version.
                      // The page is always requested from this server, whatever the path contains.
                      const origin = server.resolvedUrls?.local[0];
                      if (!origin) return next();
                      fetch(pageURL(origin, pathname), { redirect: "manual" })
                        .then(async (response) => (response.ok ? pageMarkdown(await response.text()) : undefined))
                        .then((alternate) =>
                          send(alternate?.path === pathname ? Buffer.from(alternate.markdown) : undefined),
                        )
                        .catch(next);
                    } else if (pathname.startsWith("/assets/")) {
                      manifest ??= new AssetManifest();
                      outputs ??= manifest.outputs();
                      const contents = outputs.get(pathname)?.contents;
                      if (contents) return send(contents);
                      // WebP copies of images are made on first request.
                      manifest.variantOutput(pathname).then(send, next);
                    } else {
                      next();
                    }
                  });
                },
              },
            ],
          },
        });
      },
      "astro:build:done": async ({ dir, logger }) => {
        const output = fileURLToPath(dir);
        const write = (pathname: string, contents: Buffer | string) => {
          const destination = path.join(output, pathname);
          mkdirSync(path.dirname(destination), { recursive: true });
          writeFileSync(destination, contents);
        };

        const manifest = new AssetManifest();
        const outputs = manifest.outputs();
        for (const [url, { contents }] of outputs) write(url, contents);
        const variants = await manifest.variantOutputs();
        for (const [url, { contents }] of variants) write(url, contents);
        const pruned = manifest.pruneImageCache();
        const { encoded, cached } = manifest.imageCacheStatistics;
        // TEMPORARY: report the image cache in the preview deployment.
        write(
          "/image-cache.txt",
          JSON.stringify({ ...manifest.imageCacheStatistics, pruned, imageCache: manifest.imageCache, at: new Date() }) +
            "\n",
        );
        logger.info(
          `Encoded ${encoded} WebP copies of images and read ${cached} from ${path.relative(ROOT, manifest.imageCache)}` +
            (pruned > 0 ? `, deleting ${pruned} unused copies` : ""),
        );

        let markdownCount = 0;
        for (const file of pages(output)) {
          const alternate = pageMarkdown(readFileSync(file, "utf8"));
          if (!alternate) continue;
          write(alternate.path, alternate.markdown);
          markdownCount++;
        }

        // Compare names exactly: Cloudflare paths are case-sensitive, but file systems may not be.
        const existsExactly = (relative: string): boolean => {
          let directory = output;
          for (const part of relative.split("/").filter(Boolean)) {
            if (!existsSync(directory) || !statSync(directory).isDirectory()) return false;
            if (!readdirSync(directory).includes(part)) return false;
            directory = path.join(directory, part);
          }
          return true;
        };
        const exists = (pathname: string) => {
          const relative = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
          return [path.join(relative, "index.html"), `${relative}.html`, relative].some(
            (candidate) => candidate && existsExactly(candidate) && statSync(path.join(output, candidate)).isFile(),
          );
        };
        const rules = redirects(manifest, exists);
        write("/_redirects", rules.map(({ from, to, status }) => `${from} ${to} ${status}`).join("\n") + "\n");
        write("/_headers", headers());
        logger.info(
          `Wrote ${outputs.size} assets, ${variants.size} WebP copies of images, ` +
            `${markdownCount} Markdown versions of pages, and ${rules.length} redirects`,
        );
      },
    },
  };
}

/** The HTML pages in the output directory that may link to a Markdown version, skipping bundled and published assets. */
function* pages(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== "_astro" && entry.name !== "assets") yield* pages(file);
    else if (entry.isFile() && entry.name.endsWith(".html")) yield file;
  }
}
