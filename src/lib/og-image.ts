import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import satori, { type SatoriOptions } from "satori";
import sharp from "sharp";
import { ROOT, paths } from "./site.ts";
import { camelBreak } from "./text.ts";

/** The size of every Open Graph image. Link previews show large images at about 1.91:1. */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** The text that an Open Graph image shows. */
export type OgCard =
  | {
      kind: "article";
      /** Plain text, without HTML. */
      title: string;
      /** The article's description, as plain text. */
      summary?: string | undefined;
      category?: string | undefined;
      authors: string[];
    }
  | { kind: "site" };

/** The card for the home page and other pages that aren't articles, and the slug in its image's name. */
export const SITE_CARD: OgCard = { kind: "site" };
export const SITE_CARD_SLUG = "nshipster";

/** An Open Graph image's absolute URL and the values for its `og:image:*` tags. */
export interface OgImage {
  url: string;
  width: number;
  height: number;
  alt: string;
}

const TAGLINE = "A journal of the overlooked bits in Objective-C, Swift, and Cocoa.";

// Keep these aligned with the light palette in `assets/css/_colors.scss`.
// Satori can't resolve CSS variables.
const ORANGE = "#ff8000";
const BACKGROUND = "#f2f2f7";
const TEXT = "#000000";
const SECONDARY_TEXT = "#3c3c43";

const PADDING = { top: 48, right: 80, bottom: 48, left: 80 } as const;
const TEXT_WIDTH = OG_IMAGE_WIDTH - PADDING.left - PADDING.right;
const TITLE_LINE_HEIGHT = 1.15;
const TITLE_LETTER_SPACING = "-0.01em";
/** Title sizes in pixels, largest first. A title uses the largest size at which it fits. */
const TITLE_SIZES = [128, 112, 100, 88, 80, 72, 64, 56, 50, 44] as const;
/** How much larger a title must be to break between camel-case words instead of only between words. */
const CAMEL_BREAK_GAIN = 1.3;
/**
 * The height available to the title, and to the summary below it,
 * which leaves a margin below the header and above the byline.
 */
const TEXT_HEIGHT = { article: 360, site: 270 } as const;
/**
 * Summary sizes in pixels, largest first.
 * Link previews often show these images about 500 pixels wide, at about 0.42 times their size,
 * where 28 pixels becomes about 12, the smallest size that reads easily.
 */
const SUMMARY_SIZES = [32, 30, 28] as const;
const SUMMARY_LINE_HEIGHT = 1.35;
/** The space between the title and the summary. */
const SUMMARY_GAP = 20;
/** The smallest title size at which the summary keeps its largest size. */
const TITLE_FLOOR = 56;

const FONT_FILES = [
  ["Merriweather-Regular.woff", 400, "normal"],
  ["Merriweather-Italic.woff", 400, "italic"],
  ["Merriweather-Bold.woff", 700, "normal"],
  ["Merriweather-Black.woff", 900, "normal"],
] as const;

const fontPath = (file: string) => path.join(ROOT, paths.assets, "fonts", file);
const logoPath = path.join(ROOT, paths.assets, "images", "logo.svg");

let fonts: SatoriOptions["fonts"] | undefined;
function loadFonts(): SatoriOptions["fonts"] {
  // Satori reads TrueType, OpenType, and WOFF fonts, but not WOFF2.
  fonts ??= FONT_FILES.map(([file, weight, style]) => ({
    name: "Merriweather",
    data: readFileSync(fontPath(file)),
    weight,
    style,
  }));
  return fonts;
}

let logo: { uri: string; aspectRatio: number } | undefined;
function loadLogo(): { uri: string; aspectRatio: number } {
  if (logo) return logo;
  const svg = readFileSync(logoPath, "utf8");
  const viewBox = svg.match(/\bviewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!viewBox) throw new Error("The logo must have a viewBox starting at 0 0.");
  logo = {
    uri: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    aspectRatio: Number(viewBox[1]) / Number(viewBox[2]),
  };
  return logo;
}

let fingerprint: string | undefined;
/**
 * A digest of the inputs besides the card text that change an image:
 * this module's source, the fonts, and the logo.
 * A change to the design gives every image a new URL.
 */
function designFingerprint(): string {
  if (fingerprint) return fingerprint;
  const hash = createHash("sha256");
  hash.update(readFileSync(path.join(ROOT, "src/lib/og-image.ts")));
  for (const [file] of FONT_FILES) hash.update(readFileSync(fontPath(file)));
  hash.update(readFileSync(logoPath));
  fingerprint = hash.digest("hex");
  return fingerprint;
}

/** Joins names like the article byline: "A", "A & B", or "A, B & C". */
export function formatAuthors(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
}

/**
 * The file name of an image, without the extension:
 * the slug and a digest of the card and the design.
 * The name changes, and link previews update, when either one changes.
 */
export function ogImageName(slug: string, card: OgCard): string {
  const digest = createHash("sha256")
    .update(designFingerprint())
    .update(JSON.stringify(card))
    .digest("hex")
    .slice(0, 16);
  return `${slug}-${digest}`;
}

/** The image for a card, with an absolute URL and alternative text for what it shows. */
export function ogImage(slug: string, card: OgCard, site: URL | string): OgImage {
  return {
    // Like other content-hashed files under `/assets/`, browsers and CDNs may cache these for a year.
    url: new URL(`/assets/og/${ogImageName(slug, card)}.png`, site).href,
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    alt:
      card.kind === "site"
        ? `NSHipster: ${TAGLINE}`
        : `${card.title}${card.authors.length > 0 ? `, by ${formatAuthors(card.authors)}` : ""}, on NSHipster`,
  };
}

type Node = { type: string; key?: string; props: Record<string, unknown> };

function element(type: string, style: Record<string, unknown>, children?: Node | Node[] | string, key?: string): Node {
  return { type, ...(key ? { key } : {}), props: { style, children } };
}

/**
 * Characters in article titles that Merriweather lacks, and their replacements.
 * The site shows these with system fonts.
 */
const SUBSTITUTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  // The Apple logo is in a private use area of Apple's system fonts.
  [/\uf8ff\s*/g, "Apple "],
  [/\u27e8/g, "<"],
  [/\u27e9/g, ">"],
  // A card has room for one paragraph.
  [/\s+/g, " "],
];

/**
 * Plain text for a card, on one line,
 * with replacements for characters that the card's font lacks.
 */
export function cardText(text: string): string {
  return SUBSTITUTIONS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text).trim();
}

function titleStyle(card: OgCard, size: number): Record<string, unknown> {
  return {
    fontWeight: card.kind === "site" ? 700 : 900,
    fontSize: `${size}px`,
    lineHeight: TITLE_LINE_HEIGHT,
    letterSpacing: TITLE_LETTER_SPACING,
  };
}

function summaryStyle(size: number): Record<string, unknown> {
  return { fontWeight: 400, fontSize: `${size}px`, lineHeight: SUMMARY_LINE_HEIGHT };
}

/** Text as it appears on a card, which may contain zero-width spaces to break long names, and its size in pixels. */
export interface TextLayout {
  text: string;
  size: number;
}

/** The title and summary of a card. */
export interface CardTextLayout {
  title: TextLayout;
  summary?: TextLayout | undefined;
}

/** The Satori element tree for a card. */
function cardLayout(card: OgCard, layout: CardTextLayout): Node {
  const { uri, aspectRatio } = loadLogo();
  const logoImage = (height: number): Node => ({
    type: "img",
    props: { src: uri, width: Math.round(height * aspectRatio), height },
  });
  const block = (style: Record<string, unknown>, text: string, key: string) =>
    element("div", { ...style, display: "block", width: `${TEXT_WIDTH}px`, flexShrink: 0 }, text, key);
  const heading = block(
    {
      ...titleStyle(card, layout.title.size),
      color: card.kind === "site" ? SECONDARY_TEXT : TEXT,
      // Satori's `word-break: break-word` breaks words that balanced lines could fit,
      // so the title's size leaves room for the longest word instead.
      textWrap: "balance",
    },
    layout.title.text,
    "title",
  );
  const text = layout.summary
    ? element("div", { display: "flex", flexDirection: "column", gap: `${SUMMARY_GAP}px`, flexShrink: 0 }, [
        heading,
        block({ ...summaryStyle(layout.summary.size), color: SECONDARY_TEXT }, layout.summary.text, "summary"),
      ])
    : heading;
  const domain = element("div", {}, "nshipster.com");
  return element(
    "div",
    {
      width: "100%",
      height: "100%",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      paddingTop: `${PADDING.top}px`,
      paddingRight: `${PADDING.right}px`,
      paddingBottom: `${PADDING.bottom}px`,
      paddingLeft: `${PADDING.left}px`,
      // The site's pages have an orange top border, too.
      borderTop: `14px solid ${ORANGE}`,
      backgroundColor: BACKGROUND,
      color: TEXT,
      fontFamily: "Merriweather",
    },
    card.kind === "site"
      ? [
          logoImage(128),
          heading,
          element("div", { display: "flex", fontSize: "30px", color: SECONDARY_TEXT }, [domain]),
        ]
      : [
          element("div", { display: "flex", alignItems: "center", justifyContent: "space-between" }, [
            logoImage(64),
            element(
              "div",
              {
                fontWeight: 700,
                fontSize: "28px",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                // Orange text on the background has too little contrast to read easily.
                color: SECONDARY_TEXT,
              },
              card.category ?? "",
            ),
          ]),
          text,
          element(
            "div",
            { display: "flex", justifyContent: "space-between", gap: "40px", fontSize: "30px", color: SECONDARY_TEXT },
            [
              element(
                "div",
                {
                  fontStyle: "italic",
                  flexShrink: 1,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                },
                card.authors.length > 0 ? `Written by ${formatAuthors(card.authors)}` : "",
              ),
              domain,
            ],
          ),
        ],
  );
}

/** The widths of a text's words, of the space between words, and of an ellipsis, at a size of 100 pixels. */
interface WordWidths {
  words: number[];
  space: number;
  ellipsis: number;
}

/** Splits text where Satori may break lines, keeping the words that it keeps together. */
function splitWords(text: string): string[] {
  const words: string[] = [];
  // Zero-width spaces are break opportunities, too.
  for (const word of text.split(/[\s\u200b]+/).filter(Boolean)) {
    // Unicode line breaking keeps closing punctuation and slashes on the line before, even after a space.
    if (words.length > 0 && /^[)\]}!?,.:;/\u2026]/.test(word)) words[words.length - 1] += ` ${word}`;
    else words.push(word);
  }
  return words;
}

/** Measures the words of each text in its style, at a size of 100 pixels, with one layout. */
async function measureWords(
  texts: ReadonlyArray<{ style: (size: number) => Record<string, unknown>; text: string }>,
): Promise<WordWidths[]> {
  const groups = texts.map(({ style, text }) => ({
    style: { ...style(100), whiteSpace: "pre" },
    words: splitWords(text),
  }));
  const nodes = groups.flatMap(({ style, words }, group) =>
    [...words, "a a", "aa", "\u2026"].map((sample, index) => element("div", style, sample, `${group}-${index}`)),
  );
  const widths = new Map<string, number>();
  await satori(
    element(
      "div",
      { display: "flex", flexDirection: "column", alignItems: "flex-start", fontFamily: "Merriweather" },
      nodes,
    ) as never,
    {
      width: 100_000,
      height: 150 * nodes.length,
      fonts: loadFonts(),
      onNodeDetected: (node) => {
        if (typeof node.key === "string") widths.set(node.key, node.width);
      },
    },
  );
  return groups.map(({ words }, group) => {
    const width = (index: number) => widths.get(`${group}-${index}`) ?? 0;
    return {
      words: words.map((_, index) => width(index)),
      space: width(words.length) - width(words.length + 1),
      ellipsis: width(words.length + 2),
    };
  });
}

// Leave a little room for differences between these estimates and Satori's layout.
const AVAILABLE_WIDTH = TEXT_WIDTH * 0.98;

/**
 * The number of lines that a greedy line breaker needs for words at a size,
 * or `undefined` if a word is wider than a line.
 */
function lineCount({ words, space }: WordWidths, size: number): number | undefined {
  const scale = size / 100;
  let lines = 1;
  let line = 0;
  for (const word of words) {
    const width = word * scale;
    if (width > AVAILABLE_WIDTH) return undefined;
    if (line > 0 && line + space * scale + width > AVAILABLE_WIDTH) {
      lines += 1;
      line = width;
    } else {
      line += (line > 0 ? space * scale : 0) + width;
    }
  }
  return lines;
}

/** A title's text and the widths of its words. */
type TitleText = { text: string; widths: WordWidths };

/**
 * The largest title size, no smaller than `floor`, at which each word fits on a line
 * and every line fits in a height.
 * Long names like `UILocalizedIndexedCollation` may also break between camel-case words,
 * as they do on the site, if that lets the title be much larger.
 */
function fitTitle(titles: readonly TitleText[], height: number, floor: number): TextLayout | undefined {
  const fittingSize = ({ widths }: TitleText) =>
    TITLE_SIZES.find((size) => {
      const lines = lineCount(widths, size);
      return size >= floor && lines !== undefined && lines * size * TITLE_LINE_HEIGHT <= height;
    });
  const [plain, broken] = titles;
  const size = fittingSize(plain!);
  const brokenSize = broken && fittingSize(broken);
  if (size !== undefined && (brokenSize === undefined || brokenSize < size * CAMEL_BREAK_GAIN))
    return { text: plain!.text, size };
  return brokenSize === undefined ? undefined : { text: broken!.text, size: brokenSize };
}

/** The height of a summary at a size, or `undefined` if a word is wider than a line. */
function summaryHeight(widths: WordWidths, size: number): number | undefined {
  const lines = lineCount(widths, size);
  return lines === undefined ? undefined : lines * size * SUMMARY_LINE_HEIGHT;
}

/**
 * Sizes a card's title and summary to fit together.
 * The summary keeps its largest size, and the title takes the largest size that fits above it,
 * down to {@link TITLE_FLOOR}.
 * After that, the summary gets smaller, and then the title gets as small as it needs to.
 * If the summary doesn't fit even then, it ends early, with an ellipsis.
 */
export async function cardTextLayout(card: OgCard): Promise<CardTextLayout> {
  const title = card.kind === "site" ? TAGLINE : card.title;
  const broken = camelBreak(title);
  const summary = card.kind === "article" && card.summary ? card.summary : undefined;
  const texts = [title, ...(broken === title ? [] : [broken])].map((text) => ({
    style: (size: number) => titleStyle(card, size),
    text,
  }));
  const widths = await measureWords(summary ? [...texts, { style: summaryStyle, text: summary }] : texts);
  const titles = texts.map(({ text }, index) => ({ text, widths: widths[index]! }));
  const minimum = TITLE_SIZES.at(-1)!;
  if (!summary) return { title: fitTitle(titles, TEXT_HEIGHT[card.kind], 0) ?? { text: broken, size: minimum } };

  const summaryWidths = widths.at(-1)!;
  for (const floor of [TITLE_FLOOR, minimum]) {
    for (const size of SUMMARY_SIZES) {
      const height = summaryHeight(summaryWidths, size);
      if (height === undefined) continue;
      const fitted = fitTitle(titles, TEXT_HEIGHT.article - SUMMARY_GAP - height, floor);
      if (fitted) return { title: fitted, summary: { text: summary, size } };
    }
  }

  // A summary too long for the card at the smallest sizes ends with an ellipsis after the last word that fits.
  const size = SUMMARY_SIZES.at(-1)!;
  const smallest = titles.find(({ widths }) => lineCount(widths, minimum) !== undefined) ?? titles.at(-1)!;
  const fitted = { text: smallest.text, size: minimum };
  const available =
    TEXT_HEIGHT.article - SUMMARY_GAP - (lineCount(smallest.widths, minimum) ?? 1) * minimum * TITLE_LINE_HEIGHT;
  const words = splitWords(summary);
  for (let count = words.length - 1; count > 0; count--) {
    const shortened = {
      ...summaryWidths,
      words: [...summaryWidths.words.slice(0, count - 1), summaryWidths.words[count - 1]! + summaryWidths.ellipsis],
    };
    const height = summaryHeight(shortened, size);
    if (height !== undefined && height <= available)
      return {
        title: fitted,
        summary: {
          text: `${words
            .slice(0, count)
            .join(" ")
            .replace(/[\s,;:.\u2014\u2013-]+$/, "")}\u2026`,
          size,
        },
      };
  }
  return { title: fitted };
}

/** Renders a card as a PNG with a 256-color palette, which keeps the text smooth at about half the size. */
export async function renderOgImage(card: OgCard): Promise<Buffer> {
  const layout = await cardTextLayout(card);
  const heights = new Map<string, number>();
  const svg = await satori(cardLayout(card, layout) as never, {
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    fonts: loadFonts(),
    onNodeDetected: (node) => {
      if (typeof node.key === "string") heights.set(node.key, node.height);
    },
  });
  // The estimates in `cardTextLayout` leave some room, but Satori's layout is what the image shows.
  const height = (heights.get("title") ?? 0) + (layout.summary ? SUMMARY_GAP + (heights.get("summary") ?? 0) : 0);
  if (height > TEXT_HEIGHT[card.kind])
    throw new Error(`The text of the Open Graph image for "${layout.title.text}" is ${height} pixels tall.`);
  return sharp(Buffer.from(svg)).png({ palette: true, compressionLevel: 9 }).toBuffer();
}
