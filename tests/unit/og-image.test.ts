import sharp from "sharp";
import { describe, expect, it } from "vite-plus/test";
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  SITE_CARD,
  cardTitle,
  formatAuthors,
  ogImage,
  ogImageName,
  renderOgImage,
  titleLayout,
  type OgCard,
} from "../../src/lib/og-image.ts";
import { stripHTML } from "../../src/lib/text.ts";

const article = (title: string, authors = ["Mattt"]): OgCard => ({
  kind: "article",
  title,
  category: "Cocoa",
  authors,
});

/** Whether any dark pixels fall in the right margin beside the title, where text would overflow. */
async function overflows(png: Buffer): Promise<boolean> {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  for (let y = 150; y < 500; y++) {
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

  it.each(Object.entries(titles))("renders a %s title at 1200×630 within the margins", async (_, title) => {
    const png = await renderOgImage(article(title, ["Nate Cook", "Mattt"]));
    const { format, width, height } = await sharp(png).metadata();
    expect({ format, width, height }).toEqual({ format: "png", width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT });
    expect(await overflows(png)).toBe(false);
  });

  it("renders the site image", async () => {
    const { width, height } = await sharp(await renderOgImage(SITE_CARD)).metadata();
    expect([width, height]).toEqual([OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT]);
  });

  it("sets short titles larger than long ones", async () => {
    const short = await titleLayout(article(titles.short));
    const long = await titleLayout(article(titles.long));
    expect(short.size).toBeGreaterThan(long.size);
  });

  it("breaks long names between camel-case words only when that makes the title much larger", async () => {
    expect((await titleLayout(article("UILocalizedIndexedCollation"))).text).toBe(
      "UILocalized\u200bIndexed\u200bCollation",
    );
    expect((await titleLayout(article("NSCache"))).text).toBe("NSCache");
  });

  it("names each image for its slug and a digest of its text", () => {
    const name = ogImageName("nscache", article("NSCache"));
    expect(name).toMatch(/^nscache-[0-9a-f]{16}$/);
    expect(ogImageName("nscache", article("NSCache"))).toBe(name);
    expect(ogImageName("nscache", article("NSCache", ["Nate Cook"]))).not.toBe(name);
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
    expect(cardTitle("\uf8ffPay")).toBe("Apple Pay");
    expect(cardTitle("Uncertain\u27e8T\u27e9")).toBe("Uncertain<T>");
  });
});
