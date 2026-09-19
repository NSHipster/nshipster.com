import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { AssetManifest } from "../lib/assets.ts";
import { ROOT, paths, site } from "../lib/site.ts";
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
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".zip": "application/zip",
};

/** Removes Jekyll front matter and resolves the variables used by the text files. */
function renderTextFile(source: string, time: Date): string {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: site.timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  })
    .formatToParts(time)
    .reduce<Record<string, string>>((parts, part) => ({ ...parts, [part.type]: part.value }), {});
  return source
    .replace(/^---\n[\s\S]*?\n---\n+/, "")
    .replaceAll("{{ site.url }}", site.url)
    .replaceAll("{{ site.lang }}", site.lang)
    .replaceAll('{{ site.time | date: "%Y/%-m/%-d" }}', `${date.year}/${date.month}/${date.day}`);
}

/** Files served from the site root and `/.well-known/`, such as icons and `robots.txt`. */
function rootFiles(time = new Date()): Map<string, Buffer | string> {
  const files = new Map<string, Buffer | string>();
  const wellKnown = path.join(ROOT, paths.wellKnown);
  for (const entry of readdirSync(wellKnown).sort()) {
    const source = path.join(wellKnown, entry);
    const contents = readFileSync(source);
    const rendered =
      entry === "robots.txt" || entry === "humans.txt" ? renderTextFile(contents.toString(), time) : contents;
    files.set(`/${entry}`, rendered);
    files.set(`/.well-known/${entry}`, rendered);
  }
  files.set("/contribute.json", readFileSync(path.join(ROOT, "contribute.json")));
  return files;
}

/**
 * Publishes `assets/` with content-hashed names under `/assets/`,
 * copies root and `.well-known` files, and writes Cloudflare routing files.
 */
export function staticFiles(): AstroIntegration {
  return {
    name: "nshipster:static-files",
    hooks: {
      "astro:config:setup": ({ updateConfig, command }) => {
        if (command !== "dev") return;
        let manifest: Map<string, { contents: Buffer }> | undefined;
        updateConfig({
          vite: {
            plugins: [
              {
                name: "nshipster:static-files-dev",
                configureServer(server) {
                  server.watcher.add(path.join(ROOT, paths.assets));
                  server.watcher.on("all", (_event, file) => {
                    if (file.startsWith(path.join(ROOT, paths.assets))) manifest = undefined;
                  });
                  const files = rootFiles();
                  server.middlewares.use((request, response, next) => {
                    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
                    let contents: Buffer | undefined;
                    if (pathname.startsWith("/assets/")) {
                      manifest ??= new AssetManifest().outputs();
                      contents = manifest.get(pathname)?.contents;
                    } else if (files.has(pathname)) {
                      contents = Buffer.from(files.get(pathname)!);
                    }
                    if (!contents) return next();
                    response.setHeader(
                      "Content-Type",
                      CONTENT_TYPES[path.extname(pathname)] ?? "application/octet-stream",
                    );
                    response.end(contents);
                  });
                },
              },
            ],
          },
        });
      },
      "astro:build:done": ({ dir, logger }) => {
        const output = fileURLToPath(dir);
        const write = (pathname: string, contents: Buffer | string) => {
          const destination = path.join(output, pathname);
          mkdirSync(path.dirname(destination), { recursive: true });
          writeFileSync(destination, contents);
        };

        const manifest = new AssetManifest();
        const outputs = manifest.outputs();
        for (const [url, { contents }] of outputs) write(url, contents);
        for (const [pathname, contents] of rootFiles()) write(pathname, contents);

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
        logger.info(`Wrote ${outputs.size} assets and ${rules.length} redirects`);
      },
    },
  };
}
