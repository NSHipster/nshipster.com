import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { Loader, LoaderContext } from "astro/loaders";
import { assetManifest, resetAssetManifest } from "../assets.ts";
import { zoned } from "../dates.ts";
import { resetBibliography } from "../render/citations.ts";
import { renderDocument, renderFragment, type MarkdownRenderer } from "../render/index.ts";
import { ROOT, paths } from "../site.ts";
import { plainText } from "../text.ts";
import { parseFrontMatter } from "./frontmatter.ts";
import { isUnpublished, normalizePost, type PostData } from "./posts.ts";

/**
 * Content loaders for the English site.
 *
 * Articles are rendered at load time (Liquid, then Markdown, then HTML transformations)
 * and stored as rendered HTML in Astro's content layer.
 * Each entry's digest covers its source, the rendering code, the bibliography,
 * and the assets it references, so that a change to any of them re-renders it.
 */

const RENDER_SOURCES = [
  "src/lib/render",
  "src/lib/content",
  "src/lib/assets.ts",
  "src/lib/dates.ts",
  "src/lib/scalar.ts",
  "src/lib/site.ts",
  "src/lib/text.ts",
  // The sharp version is part of the URLs of WebP copies of images.
  "node_modules/sharp/package.json",
  paths.books,
];

function hashFiles(entries: string[]): string {
  const hash = createHash("sha256");
  const visit = (file: string) => {
    if (!existsSync(file)) return;
    if (statSync(file).isFile()) {
      hash.update(file).update(readFileSync(file));
      return;
    }
    for (const entry of readdirSync(file).sort()) visit(path.join(file, entry));
  };
  for (const entry of entries) visit(path.join(ROOT, entry));
  return hash.digest("hex");
}

/** A digest of the code and data that affect rendering, excluding each article's own source. */
function rendererDigest(): string {
  const bibliography = readFileSync(path.join(ROOT, paths.bibliography));
  // `site.time` is available to articles; only the year is used today.
  return createHash("sha256")
    .update(hashFiles(RENDER_SOURCES))
    .update(bibliography)
    .update(String(new Date().getFullYear()))
    .digest("hex");
}

function markdownRenderer(context: LoaderContext): MarkdownRenderer {
  // A leading newline keeps a body that starts with `---` from being read as front matter.
  return async (markdown) => (await context.renderMarkdown(`\n${markdown}`)).html;
}

/**
 * Warns when the article submodule's checkout differs from the revision
 * recorded in this repository. `mise run content:update` changes it deliberately.
 */
function checkSubmoduleRevision(context: LoaderContext, directory: string): void {
  try {
    const recorded = execFileSync("git", ["ls-tree", "HEAD", directory], { cwd: ROOT, encoding: "utf8" }).split(
      /\s+/,
    )[2];
    const checkedOut = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: path.join(ROOT, directory),
      encoding: "utf8",
    }).trim();
    if (recorded && checkedOut && recorded !== checkedOut) {
      context.logger.warn(
        `${directory} is at ${checkedOut.slice(0, 7)}, but this repository records ${recorded.slice(0, 7)}. ` +
          "Run `git submodule update --init` to use the recorded articles.",
      );
    }
  } catch {
    // Git is unavailable, e.g. in an exported source tree.
  }
}

interface PostsLoaderOptions {
  /** Directory of Markdown files, relative to the repository root. */
  directory: string;
  /** Specific files in the directory; defaults to all posts named `YYYY-MM-DD-slug.md`. */
  files?: Array<{ file: string; slug: string }>;
  /** Whether entries are articles, which link to their commit history. */
  articles: boolean;
}

export type PostEntryData = PostData & {
  /** The excerpt rendered as HTML, like `page.excerpt | markdownify`. */
  excerptHTML: string;
  /** The excerpt as plain text, for descriptions. */
  description: string;
  /** Citation keys in the order cited. */
  citations: string[];
};

/** Loads and renders articles, or article-like pages such as `/return/`. */
export function postsLoader(options: PostsLoaderOptions): Loader {
  return {
    name: "nshipster-posts",
    load: async (context) => {
      const directory = path.join(ROOT, options.directory);
      if (options.articles) {
        if (!existsSync(directory) || readdirSync(directory).filter((file) => file.endsWith(".md")).length === 0) {
          throw new Error(
            `No articles found in ${options.directory}. Run \`mise run setup\` to initialize the articles submodule.`,
          );
        }
        checkSubmoduleRevision(context, options.directory);
      }

      const render = markdownRenderer(context);
      const time = new Date();

      const sources = (): Array<{ file: string; slug?: string }> =>
        options.files ??
        readdirSync(directory)
          .filter((file) => /^\d{4}-\d{1,2}-\d{1,2}-.+\.md$/.test(file))
          .sort()
          .map((file) => ({ file }));

      const sync = async () => {
        const assets = assetManifest();
        const renderer = rendererDigest();
        const seen = new Set<string>();

        for (const { file, slug } of sources()) {
          const filePath = path.join(directory, file);
          const relative = path.relative(ROOT, filePath);
          const text = readFileSync(filePath, "utf8");
          const document = parseFrontMatter(text, relative);
          if (isUnpublished(document)) continue;

          const post = normalizePost(document, { file: relative, slug, commitHistory: options.articles });
          seen.add(post.slug);

          const dependencies = JSON.parse(context.meta.get(`assets:${post.slug}`) ?? "[]") as string[];
          const digest = context.generateDigest(
            [text, renderer, ...dependencies.map((name) => `${name}=${assets.digest(name)}`)].join("\0"),
          );
          if (context.store.get(post.slug)?.digest === digest) continue;

          const result = await renderDocument(document.body, {
            file: relative,
            assets,
            markdown: render,
            time,
            page: {
              title: post.title,
              url: post.url,
              excerpt: post.excerpt,
              date: zoned(post.date),
              updated_on: zoned(post.updatedOn),
              category: post.category,
              author: post.author,
            },
          });
          context.meta.set(`assets:${post.slug}`, JSON.stringify(result.assets));

          const excerptHTML = await renderFragment(post.excerpt, render);
          const data = await context.parseData({
            id: post.slug,
            filePath: relative,
            data: {
              ...post,
              excerptHTML,
              description: plainText(excerptHTML),
              citations: result.citations,
            } satisfies PostEntryData as unknown as Record<string, unknown>,
          });
          context.store.set({
            id: post.slug,
            data,
            filePath: relative,
            digest: context.generateDigest(
              [text, renderer, ...result.assets.map((name) => `${name}=${assets.digest(name)}`)].join("\0"),
            ),
            rendered: { html: result.html, metadata: { imagePaths: [] } },
          });
        }

        for (const id of context.store.keys()) {
          if (!seen.has(id)) context.store.delete(id);
        }
      };

      await sync();

      const watcher = context.watcher;
      if (!watcher) return;
      // Watch the listed page files, not their whole directory.
      const sourcesWatched = options.files ? options.files.map(({ file }) => path.join(directory, file)) : [directory];
      const watched = [
        ...sourcesWatched,
        path.join(ROOT, paths.bibliography),
        path.join(ROOT, paths.assets),
        path.join(ROOT, paths.books),
      ];
      watcher.add(watched);
      let pending: Promise<void> | undefined;
      const onChange = (changed: string) => {
        if (!watched.some((entry) => changed === entry || changed.startsWith(entry + path.sep))) return;
        if (changed.startsWith(path.join(ROOT, paths.assets))) resetAssetManifest();
        if (changed.startsWith(path.join(ROOT, paths.bibliography))) resetBibliography();
        pending = (pending ?? Promise.resolve())
          .then(sync)
          .then(() => context.logger.info(`Reloaded content after a change to ${path.relative(ROOT, changed)}`))
          .catch((error: unknown) => context.logger.error(error instanceof Error ? error.message : String(error)));
      };
      watcher.on("change", onChange);
      watcher.on("add", onChange);
      watcher.on("unlink", onChange);
    },
  };
}
