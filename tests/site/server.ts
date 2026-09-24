import { existsSync } from "node:fs";
import path from "node:path";
import { unstable_startWorker } from "wrangler";

export interface PreviewServer {
  url: URL;
  close: () => Promise<void>;
}

/**
 * Serves `dist/` with Cloudflare's static asset routing, redirects, and headers,
 * using the site's Wrangler configuration.
 */
export async function startPreview(): Promise<PreviewServer> {
  if (!existsSync(path.join(process.cwd(), "dist", "index.html"))) {
    throw new Error("Build the site with `mise run build` before running site tests.");
  }
  const worker = await unstable_startWorker({
    config: "wrangler.jsonc",
    dev: { server: { hostname: "127.0.0.1", port: 0 }, inspector: false, logLevel: "error" },
  });
  await worker.ready;
  return { url: await worker.url, close: () => worker.dispose() };
}
