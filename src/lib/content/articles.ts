import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { AstroIntegrationLogger } from "astro";
import { ROOT, paths } from "../site.ts";

/**
 * The English articles come from the `master` branch of `NSHipster/articles`.
 * Each build downloads the branch's latest commit,
 * so a push to that repository needs only a rebuild to be published.
 * `ARTICLES_REF` selects a different branch, tag, or commit.
 */
function archiveURL(): string {
  return `https://codeload.github.com/NSHipster/articles/tar.gz/${process.env.ARTICLES_REF || "refs/heads/master"}`;
}

/**
 * The directory of article sources:
 * a local checkout of `NSHipster/articles` named by `ARTICLES_DIR`,
 * or the downloaded copy in Astro's cache directory.
 */
export function articlesDirectory(): string {
  const local = process.env.ARTICLES_DIR;
  return local ? path.resolve(ROOT, local) : path.join(ROOT, paths.articles);
}

/** Downloads the articles into `articlesDirectory()`, unless `ARTICLES_DIR` names a local checkout. */
export async function downloadArticles(logger: AstroIntegrationLogger): Promise<void> {
  const directory = articlesDirectory();
  if (process.env.ARTICLES_DIR) {
    logger.info(`Using the articles in ${directory}`);
    return;
  }

  const url = archiveURL();
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const archive = gunzipSync(Buffer.from(await response.arrayBuffer()));
    // Extract a complete copy, then replace the previous one, so that deleted articles disappear.
    // Archive entries are in a directory named like `articles-master/`.
    const staging = `${directory}.download`;
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    execFileSync("tar", ["-x", "--strip-components=1", "-C", staging], { input: archive });
    rmSync(directory, { recursive: true, force: true });
    renameSync(staging, directory);
    // GitHub records the commit in the archive's first entry, a global pax header.
    const commit = archive.toString("latin1", 512, 1024).match(/comment=([0-9a-f]{40})/)?.[1];
    logger.info(`Downloaded the articles${commit ? ` at ${commit.slice(0, 7)}` : ""} from ${url}`);
  } catch (error) {
    const message = `Cannot download the articles from ${url}: ${error instanceof Error ? error.message : String(error)}`;
    // Let local builds work offline with the previous download, but never publish stale articles.
    if (process.env.CI || !existsSync(directory) || readdirSync(directory).length === 0) throw new Error(message);
    logger.warn(`${message}. Using the previous download.`);
  }
}
