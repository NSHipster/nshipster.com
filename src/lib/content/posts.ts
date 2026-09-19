import path from "node:path";
import { localDate, parseDate, type ZonedDate } from "../dates.ts";
import { site } from "../site.ts";
import type { ParsedDocument } from "./frontmatter.ts";
import { scalarText } from "../scalar.ts";

/** Normalized front matter shared by articles and article-like pages. */
export interface PostData {
  /** The filename slug, preserved exactly, e.g. `swift-1.2` or `__attribute__`. */
  slug: string;
  url: string;
  title: string;
  date: Date;
  /** The latest revision date, if the article lists revisions. */
  lastRevisedOn?: Date;
  /** The latest revision date, or the publication date. */
  updatedOn: Date;
  revisions: Array<{ date: string; description: string }>;
  author?: string;
  authors: string[];
  category: string;
  tags: string[];
  excerpt: string;
  status?: { swift?: string; reviewed?: string };
  retired: boolean;
  /** The source file name, used for the GitHub edit link. */
  sourcePath: string;
  commitHistoryURL?: string;
}

const POST_FILENAME = /^(\d{4})-(\d{1,2})-(\d{1,2})-(.+)\.md$/;

export class FrontMatterError extends Error {}

/** Returns the date and slug encoded in a post filename. */
export function parsePostFilename(filename: string): { date: ZonedDate; slug: string } | undefined {
  const match = path.basename(filename).match(POST_FILENAME);
  if (!match) return undefined;
  const [, year, month, day, slug] = match;
  return { date: localDate(Number(year), Number(month), Number(day)), slug: slug! };
}

function string(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return scalarText(value);
}

/** Jekyll accepts a single tag, a list, or a delimited string. */
function list(...values: unknown[]): string[] {
  return values.flatMap((value) => {
    if (value === undefined || value === null || value === "") return [];
    if (Array.isArray(value)) return value.map(scalarText);
    return scalarText(value)
      .split(/[,\s]+/)
      .filter(Boolean);
  });
}

/** Whether a document should be excluded from the site. */
export function isUnpublished(document: ParsedDocument): boolean {
  return document.data.published === false;
}

export interface NormalizeOptions {
  file: string;
  /** For pages: the slug and date, which are not encoded in the filename. */
  slug?: string;
  /** For articles: generate the commit history link. */
  commitHistory?: boolean;
}

/** Normalizes article front matter the way the Jekyll site's hooks did. */
export function normalizePost(document: ParsedDocument, options: NormalizeOptions): PostData {
  const { data } = document;
  const filename = path.basename(options.file);
  const fromFilename = parsePostFilename(filename);
  const slug = options.slug ?? fromFilename?.slug;
  if (!slug) throw new FrontMatterError(`Cannot determine slug for ${options.file}`);

  const date = (data.date !== undefined ? parseDate(data.date) : undefined) ?? fromFilename?.date;
  if (!date) throw new FrontMatterError(`Missing or invalid date in ${options.file}`);

  const title = string(data.title);
  if (!title) throw new FrontMatterError(`Missing title in ${options.file}`);

  const revisions = Object.entries((data.revisions ?? {}) as Record<string, unknown>).map(([key, value]) => ({
    date: key,
    description: scalarText(value),
  }));
  let lastRevisedOn: Date | undefined;
  if (revisions.length > 0) {
    const latest = revisions
      .map((revision) => revision.date)
      .sort()
      .at(-1)!;
    const parsed = parseDate(latest);
    if (!parsed) throw new FrontMatterError(`Invalid revision date "${latest}" in ${options.file}`);
    lastRevisedOn = parsed.date;
  }

  const status = data.status as Record<string, unknown> | undefined;

  return {
    slug,
    url: `/${slug}/`,
    title,
    date: date.date,
    lastRevisedOn,
    updatedOn: lastRevisedOn ?? date.date,
    revisions,
    author: string(data.author),
    authors: list(data.authors),
    category: string(data.category) ?? "",
    tags: list(data.tag, data.tags),
    excerpt: string(data.excerpt) ?? "",
    status: status
      ? {
          // Keep version numbers as written: `5.0` must not become `5`.
          swift: document.source(["status", "swift"]) ?? string(status.swift),
          reviewed: document.source(["status", "reviewed"]) ?? string(status.reviewed),
        }
      : undefined,
    retired: data.retired === true,
    sourcePath: filename,
    commitHistoryURL: options.commitHistory ? `${site.commitHistoryBase}${filename}` : undefined,
  };
}

/**
 * Orders posts the way Jekyll does: by date, then by path.
 * Returns a new array, oldest first.
 */
export function chronological<T extends { data: Pick<PostData, "date" | "sourcePath"> }>(posts: T[]): T[] {
  return [...posts].sort(
    (a, b) =>
      a.data.date.getTime() - b.data.date.getTime() ||
      (a.data.sourcePath < b.data.sourcePath ? -1 : a.data.sourcePath > b.data.sourcePath ? 1 : 0),
  );
}

/** Compares strings by code unit, like Liquid's `sort` filter. */
export function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
