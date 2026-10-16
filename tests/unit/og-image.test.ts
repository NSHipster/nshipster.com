import sharp from "sharp";
import { describe, expect, it } from "vite-plus/test";
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  SITE_CARD,
  cardText,
  cardTextLayout,
  formatAuthors,
  ogImage,
  ogImageName,
  renderOgImage,
  type OgCard,
} from "../../src/lib/og-image.ts";
import { stripHTML } from "../../src/lib/text.ts";

const article = (title: string, authors = ["Mattt"], summary?: string): OgCard => ({
  kind: "article",
  title,
  ...(summary ? { summary } : {}),
  category: "Cocoa",
  authors,
});

const summaries = {
  short: "AppDelegate is the dumping ground for functionality in iOS.",
  medium:
    "Poor NSCache, always being overshadowed by NSMutableDictionary. It\u2019s as if no one knew how it provides all of that garbage collection behavior that developers take great pains to re-implement themselves.",
  // The longest description of an article.
  longest: cardText(
    "As an iOS developer, if you want to make an application on your own, you sometimes need to write back-end code. Even for the developer who can take that on, there is more than just the code, there\u2019s also maintenance. Your worst fear becomes not that people might not like your application, but that your server might fail under heavy traffic.\nFortunately, we now have CloudKit. Apple takes care of all these details, so you can focus on how to make your application great.",
  ),
};

/** Whether any dark pixels fall in the right margin beside the title and summary, where text would overflow. */
async function overflows(png: Buffer): Promise<boolean> {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  for (let y = 140; y < 520; y++) {
    for (let x = info.width - 78; x < info.width; x++) if (data[y * info.width + x]! < 160) return true;
  }
  return false;
}

describe("Open Graph images", () => {
  const titles = {
    short: "NSCache",
    long: stripHTML("NSUUID /<br/>CFUUIDRef /<br/>UIDevice -uniqueIdentifier /<br/>-identifierForVendor"),
    lineBreaks: stripHTML("MKTileOverlay,<br/>MKMapSnapshotter &<br/>MKDirections"),
    camelCase: "UILocalizedIndexedCollation",
    slash: "NSFastEnumeration / NSEnumerator",
  };

  it.each(
    Object.entries(titles).flatMap(([name, title]) =>
      Object.entries(summaries).map(([length]) => [name, length, title]),
    ),
  )("renders a %s title with a %s summary at 1200×630 within the margins", async (_, length, title) => {
    const png = await renderOgImage(
      article(title, ["Nate Cook", "Mattt"], summaries[length as keyof typeof summaries]),
    );
    const { format, width, height } = await sharp(png).metadata();
    expect({ format, width, height }).toEqual({ format: "png", width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT });
    expect(await overflows(png)).toBe(false);
  });

  it.each(Object.entries(titles))("renders a %s title without a summary within the margins", async (_, title) => {
    expect(await overflows(await renderOgImage(article(title)))).toBe(false);
  });

  it("renders the site image", async () => {
    const { width, height } = await sharp(await renderOgImage(SITE_CARD)).metadata();
    expect([width, height]).toEqual([OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT]);
  });

  it("sets short titles larger than long ones", async () => {
    const short = await cardTextLayout(article(titles.short, ["Mattt"], summaries.medium));
    const long = await cardTextLayout(article(titles.long, ["Mattt"], summaries.medium));
    expect(short.title.size).toBeGreaterThan(long.title.size);
  });

  it("makes room for long summaries with a smaller title, and then a smaller summary", async () => {
    const short = await cardTextLayout(article(titles.lineBreaks, ["Mattt"], summaries.short));
    const medium = await cardTextLayout(article(titles.lineBreaks, ["Mattt"], summaries.medium));
    const longest = await cardTextLayout(article(titles.lineBreaks, ["Mattt"], summaries.longest));
    expect(short.title.size).toBeGreaterThan(medium.title.size);
    expect(medium.title.size).toBeGreaterThan(longest.title.size);
    expect(medium.summary!.size).toBeGreaterThan(longest.summary!.size);
    expect(longest.summary!.size).toBeGreaterThanOrEqual(28);
  });

  it("shows the longest summary in full below a title that fits on one line", async () => {
    for (const title of [titles.short, titles.camelCase, titles.slash]) {
      const { summary } = await cardTextLayout(article(title, ["Mattt"], summaries.longest));
      expect(summary?.text).toBe(summaries.longest);
    }
  });

  it("ends a summary too long for the card after a word, with an ellipsis", async () => {
    const summary = `${summaries.longest} ${summaries.longest}`;
    const layout = await cardTextLayout(article(titles.long, ["Mattt"], summary));
    expect(layout.summary!.text).toMatch(/\w\u2026$/);
    expect(summary.startsWith(layout.summary!.text.slice(0, -1))).toBe(true);
    expect(summary[layout.summary!.text.length - 1]).toMatch(/[\s,.]/);
    expect(await overflows(await renderOgImage(article(titles.long, ["Mattt"], summary)))).toBe(false);
  });

  it("breaks long names between camel-case words only when that makes the title much larger", async () => {
    expect((await cardTextLayout(article("UILocalizedIndexedCollation"))).title.text).toBe(
      "UILocalized\u200bIndexed\u200bCollation",
    );
    expect((await cardTextLayout(article("NSCache"))).title.text).toBe("NSCache");
  });

  it("names each image for its slug and a digest of its text", () => {
    const name = ogImageName("nscache", article("NSCache"));
    expect(name).toMatch(/^nscache-[0-9a-f]{16}$/);
    expect(ogImageName("nscache", article("NSCache"))).toBe(name);
    expect(ogImageName("nscache", article("NSCache", ["Nate Cook"]))).not.toBe(name);
    expect(ogImageName("nscache", article("NSCache", ["Mattt"], summaries.medium))).not.toBe(name);
  });

  it("describes the image with an absolute URL, its size, and alternative text", () => {
    expect(ogImage("nscache", article("NSCache"), "https://nshipster.com")).toEqual({
      url: `https://nshipster.com/assets/og/${ogImageName("nscache", article("NSCache"))}.png`,
      width: 1200,
      height: 630,
      alt: "NSCache, by Mattt, on NSHipster",
    });
  });

  it("joins authors like the byline", () => {
    expect(formatAuthors(["Mattt"])).toBe("Mattt");
    expect(formatAuthors(["Nate Cook", "Mattt"])).toBe("Nate Cook & Mattt");
    expect(formatAuthors(["Mattt", "Nate Cook", "Zoë Smith"])).toBe("Mattt, Nate Cook & Zoë Smith");
  });

  it("replaces characters that Merriweather lacks", () => {
    expect(cardText("\uf8ffPay")).toBe("Apple Pay");
    expect(cardText("Uncertain\u27e8T\u27e9")).toBe("Uncertain<T>");
  });

  it("puts the text on one line", () => {
    expect(cardText(" Traffic.\nFortunately,  we now have CloudKit. ")).toBe(
      "Traffic. Fortunately, we now have CloudKit.",
    );
  });
});
