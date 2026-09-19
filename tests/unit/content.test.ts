import { describe, expect, it } from "vite-plus/test";
import { DATE_FORMAT, localDate, parseDate, strftime, xmlschema } from "../../src/lib/dates.ts";
import { parseFrontMatter } from "../../src/lib/content/frontmatter.ts";
import { isUnpublished, normalizePost, parsePostFilename } from "../../src/lib/content/posts.ts";
import { parseAssetArguments } from "../../src/lib/render/liquid.ts";
import { gfmHeaderID, kramdownHeaderID, parameterize } from "../../src/lib/render/markdown.ts";

describe("dates", () => {
  it("uses the site time zone, including daylight saving time", () => {
    expect(xmlschema(localDate(2012, 7, 14))).toBe("2012-07-14T00:00:00-07:00");
    expect(xmlschema(localDate(2025, 12, 31))).toBe("2025-12-31T00:00:00-08:00");
  });

  it("formats dates like Ruby's strftime with ordinals", () => {
    expect(strftime(localDate(2012, 7, 14), DATE_FORMAT)).toBe("July 14<sup>th</sup>, 2012");
    expect(strftime(localDate(2019, 11, 1), DATE_FORMAT)).toBe("November 1<sup>st</sup>, 2019");
    expect(strftime(localDate(2019, 11, 12), "%o")).toBe("th");
    expect(strftime(localDate(2018, 11, 28), "(year: %Y, month: %-M, day: %-d)")).toBe(
      "(year: 2018, month: 0, day: 28)",
    );
  });

  it("parses written dates as local dates", () => {
    expect(xmlschema(parseDate("September 30, 2019")!)).toBe("2019-09-30T00:00:00-07:00");
    expect(xmlschema(parseDate("2018-10-10")!)).toBe("2018-10-10T00:00:00-07:00");
  });
});

describe("front matter", () => {
  const post = (filename: string, frontMatter: string) =>
    normalizePost(parseFrontMatter(`---\n${frontMatter}\n---\nBody`, filename), {
      file: filename,
      commitHistory: true,
    });

  it("preserves unusual slugs exactly", () => {
    expect(parsePostFilename("2015-02-09-swift-1.2.md")?.slug).toBe("swift-1.2");
    expect(parsePostFilename("2013-01-14-__attribute__.md")?.slug).toBe("__attribute__");
    expect(parsePostFilename("2014-12-1-watchkit.md")?.slug).toBe("watchkit");
    expect(post("2015-02-09-swift-1.2.md", "title: Swift 1.2").url).toBe("/swift-1.2/");
  });

  it("keeps status values as written", () => {
    const data = post("2012-07-14-nscache.md", "title: NSCache\nstatus:\n  swift: 5.0\n  reviewed: September 30, 2019");
    expect(data.status).toEqual({ swift: "5.0", reviewed: "September 30, 2019" });
  });

  it("uses the latest revision as the update date", () => {
    const data = post(
      "2012-07-31-datecomponents.md",
      'title: DateComponents\nrevisions:\n  "2012-07-31": Original\n  "2018-10-10": Expanded',
    );
    expect(xmlschema(localDate(2018, 10, 10))).toBe(xmlschema(parseDate("2018-10-10")!));
    expect(data.updatedOn.toISOString()).toBe(localDate(2018, 10, 10).date.toISOString());
    expect(data.lastRevisedOn?.toISOString()).toBe(localDate(2018, 10, 10).date.toISOString());
    expect(data.commitHistoryURL).toBe(
      "https://github.com/nshipster/articles/commits/master/2012-07-31-datecomponents.md",
    );
  });

  it("normalizes authors, categories, and tags", () => {
    const data = post(
      "2020-01-01-x.md",
      "title: X\nauthors:\n  - Mattt\n  - Nate Cook\ncategory: Swift\ntags: nshipster, popular\nretired: true",
    );
    expect(data.authors).toEqual(["Mattt", "Nate Cook"]);
    expect(data.category).toBe("Swift");
    expect(data.tags).toEqual(["nshipster", "popular"]);
    expect(data.retired).toBe(true);
  });

  it("detects unpublished articles", () => {
    expect(isUnpublished(parseFrontMatter("---\npublished: false\n---\n", "x.md"))).toBe(true);
    expect(isUnpublished(parseFrontMatter("---\ntitle: X\n---\n", "x.md"))).toBe(false);
  });
});

describe("heading IDs", () => {
  it("follows Kramdown's GFM header IDs", () => {
    const counter = new Map<string, number>();
    expect(gfmHeaderID("0 to 1", counter)).toBe("0-to-1");
    expect(gfmHeaderID("NS_ENUM", counter)).toBe("ns_enum");
    expect(gfmHeaderID("L’addition, s’il vous plaît", counter)).toBe("laddition-sil-vous-plait");
    expect(gfmHeaderID("Hors d’œuvres: Conceptual Overview", counter)).toBe("hors-doeuvres-conceptual-overview");
    expect(gfmHeaderID("Performance", counter)).toBe("performance");
    expect(gfmHeaderID("Performance", counter)).toBe("performance-1");
  });

  it("follows Kramdown's basic header IDs inside HTML", () => {
    const used = new Map<string, number>();
    expect(kramdownHeaderID("40 Columns", used)).toBe("columns");
    expect(kramdownHeaderID("50 Columns", used)).toBe("columns-1");
    expect(parameterize("Swift--Objective-C")).toBe("swift-objective-c");
  });
});

describe("asset tags", () => {
  it("parses names, attributes, and flags", () => {
    const args = parseAssetArguments("playground-icon.svg width=24 height=24 @inline");
    expect(args.name).toBe("playground-icon.svg");
    expect(args.attributes).toEqual([
      ["width", "24"],
      ["height", "24"],
    ]);
    expect([...args.flags]).toEqual(["inline"]);
  });

  it("keeps attribute text with inner quotes", () => {
    expect(parseAssetArguments('dictionary.png alt="Entry for "apple" in Dictionary.app"').attributes).toEqual([
      ["alt", "Entry for apple in Dictionary.app"],
    ]);
  });
});
