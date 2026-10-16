import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { AssetManifest } from "../lib/assets.ts";
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
  ".xml": "application/xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".zip": "application/zip",
};

/**
 * Publishes `assets/` with content-hashed names under `/assets/`,
 * along with smaller copies of the images in `src/data/responsive-images.json`,
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
        let variants: Promise<Map<string, { contents: Buffer }>> | undefined;
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
                      variants = undefined;
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
                    if (pathname.startsWith("/assets/")) {
                      manifest ??= new AssetManifest();
                      outputs ??= manifest.outputs();
                      const contents = outputs.get(pathname)?.contents;
                      if (contents) return send(contents);
                      // Smaller copies of responsive images are made on first request.
                      variants ??= manifest.variantOutputs();
                      variants.then((map) => send(map.get(pathname)?.contents), next);
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

        // Compare names exactly: Cloudflare paths are case-sensitive, but file systems may not be.
        const existsExactly = (relative: string): boolean => {
          let directory = output;
          for (const part of relative.split("/").filter(Boolean)) {
            if (!existsSync(directory) || !readdirSync(directory).includes(part)) return false;
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
          `Wrote ${outputs.size} assets, ${variants.size} smaller copies of large images, and ${rules.length} redirects`,
        );
      },
    },
  };
}
