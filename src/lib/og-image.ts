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

const PADDING = { top: 56, right: 80, bottom: 60, left: 80 } as const;
const TITLE_WIDTH = OG_IMAGE_WIDTH - PADDING.left - PADDING.right;
const TITLE_LINE_HEIGHT = 1.15;
const TITLE_LETTER_SPACING = "-0.01em";
/** Title sizes in pixels, largest first. A title uses the largest size at which it fits. */
const TITLE_SIZES = [128, 112, 100, 88, 80, 72, 64, 56, 50, 44] as const;
/** How much larger a title must be to break between camel-case words instead of only between words. */
const CAMEL_BREAK_GAIN = 1.3;
/** The height available to the title, which leaves a margin above the byline. */
const TITLE_HEIGHT = { article: 290, site: 270 } as const;

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
];

/** An article title as plain text, with replacements for characters that the card's font lacks. */
export function cardTitle(title: string): string {
  return SUBSTITUTIONS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), title).trim();
}

function titleStyle(card: OgCard, size: number): Record<string, unknown> {
  return {
    fontWeight: card.kind === "site" ? 700 : 900,
    fontSize: `${size}px`,
    lineHeight: TITLE_LINE_HEIGHT,
    letterSpacing: TITLE_LETTER_SPACING,
  };
}

/** The title's text, which may contain zero-width spaces to break long names, and its size in pixels. */
export interface TitleLayout {
  text: string;
  size: number;
}

/** The Satori element tree for a card. */
function cardLayout(card: OgCard, title: TitleLayout): Node {
  const { uri, aspectRatio } = loadLogo();
  const logoImage = (height: number): Node => ({
    type: "img",
    props: { src: uri, width: Math.round(height * aspectRatio), height },
  });
  const heading = element(
    "div",
    {
      ...titleStyle(card, title.size),
      display: "block",
      width: `${TITLE_WIDTH}px`,
      color: card.kind === "site" ? SECONDARY_TEXT : TEXT,
      // Satori's `word-break: break-word` breaks words that balanced lines could fit,
      // so the title's size leaves room for the longest word instead.
      textWrap: "balance",
    },
    title.text,
    "title",
  );
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
            logoImage(72),
            element(
              "div",
              {
                fontWeight: 700,
                fontSize: "28px",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: ORANGE,
              },
              card.category ?? "",
            ),
          ]),
          heading,
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

/** Measures each word of a title, and the space between words, at a size of 100 pixels. */
async function measureWords(card: OgCard, text: string): Promise<{ words: number[]; space: number }> {
  const words: string[] = [];
  // Zero-width spaces are break opportunities, too.
  for (const word of text.split(/[\s\u200b]+/).filter(Boolean)) {
    // Unicode line breaking keeps closing punctuation and slashes on the line before, even after a space.
    if (words.length > 0 && /^[)\]}!?,.:;/]/.test(word)) words[words.length - 1] += ` ${word}`;
    else words.push(word);
  }
  const samples = [...words, "a a", "aa"];
  const widths = new Map<string, number>();
  const style = { ...titleStyle(card, 100), whiteSpace: "pre" };
  await satori(
    element(
      "div",
      { display: "flex", flexDirection: "column", alignItems: "flex-start", fontFamily: "Merriweather" },
      samples.map((sample, index) => element("div", style, sample, `${index}`)),
    ) as never,
    {
      width: 100_000,
      height: 120 * samples.length,
      fonts: loadFonts(),
      onNodeDetected: (node) => {
        if (typeof node.key === "string") widths.set(node.key, node.width);
      },
    },
  );
  const width = (index: number) => widths.get(`${index}`) ?? 0;
  return { words: words.map((_, index) => width(index)), space: width(words.length) - width(words.length + 1) };
}

/** The number of lines that a greedy line breaker needs for words of these widths. */
function lineCount(words: number[], space: number, available: number): number {
  let lines = 1;
  let line = 0;
  for (const word of words) {
    if (line > 0 && line + space + word > available) {
      lines += 1;
      line = word;
    } else {
      line += (line > 0 ? space : 0) + word;
    }
  }
  return lines;
}

/** The largest size at which each word fits on a line and every line fits on the card. */
async function fittingSize(card: OgCard, text: string): Promise<number | undefined> {
  const { words, space } = await measureWords(card, text);
  // Leave a little room for differences between this estimate and Satori's layout.
  const available = TITLE_WIDTH * 0.98;
  return TITLE_SIZES.find((size) => {
    const scale = size / 100;
    if (Math.max(...words) * scale > available) return false;
    const lines = lineCount(
      words.map((word) => word * scale),
      space * scale,
      available,
    );
    return lines * size * TITLE_LINE_HEIGHT <= TITLE_HEIGHT[card.kind];
  });
}

/**
 * Sizes a title to fit the card.
 * Long names like `UILocalizedIndexedCollation` may also break between camel-case words,
 * as they do on the site, if that lets the title be much larger.
 */
export async function titleLayout(card: OgCard): Promise<TitleLayout> {
  const text = card.kind === "site" ? TAGLINE : card.title;
  const broken = camelBreak(text);
  const size = await fittingSize(card, text);
  const brokenSize = broken === text ? size : await fittingSize(card, broken);
  if (size !== undefined && (brokenSize === undefined || brokenSize < size * CAMEL_BREAK_GAIN)) return { text, size };
  return { text: broken, size: brokenSize ?? TITLE_SIZES.at(-1)! };
}

/** Renders a card as a PNG with a 256-color palette, which keeps the text smooth at about half the size. */
export async function renderOgImage(card: OgCard): Promise<Buffer> {
  const svg = await satori(cardLayout(card, await titleLayout(card)) as never, {
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    fonts: loadFonts(),
  });
  return sharp(Buffer.from(svg)).png({ palette: true, compressionLevel: 9 }).toBuffer();
}
