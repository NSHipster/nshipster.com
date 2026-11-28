import { describe, expect, it } from "vite-plus/test";
import { stripHTML, titleHTML } from "../../src/lib/text.ts";

describe("stripHTML", () => {
  it("replaces line breaks with a single space", () => {
    expect(stripHTML("MKTileOverlay,<br/>MKMapSnapshotter &<br/>MKDirections")).toBe(
      "MKTileOverlay, MKMapSnapshotter & MKDirections",
    );
    expect(stripHTML("Launch Arguments & <br/>Environment Variables")).toBe("Launch Arguments & Environment Variables");
    expect(stripHTML("Reader Submissions -<br> New Year's 2013")).toBe("Reader Submissions - New Year's 2013");
    expect(stripHTML("NSURL /<BR />NSURLComponents")).toBe("NSURL / NSURLComponents");
  });

  it("removes other tags without adding whitespace", () => {
    expect(stripHTML("<code>NSCache</code>s and <em>more</em>")).toBe("NSCaches and more");
  });
});

describe("titleHTML", () => {
  const breaks = (title: string) =>
    titleHTML(title).replaceAll('<span class="narrow-break">\u200b</span>', "|").replaceAll("\u200b", "^");

  it("allows a narrow-screen break after a dot between identifiers", () => {
    expect(breaks("cron & Calendar.RecurrenceRule")).toBe("cron &amp; Calendar.|Recurrence^Rule");
    expect(breaks("Message-ID and Mail.app Deep Linking")).toBe("Message-ID and Mail.app Deep Linking");
    expect(breaks("Swift 1.2")).toBe("Swift 1.2");
  });

  it("allows a narrow-screen break between an initialism and the word after it", () => {
    expect(breaks("NSURL / NSURLComponents")).toBe("NSURL / NSURL|Components");
    expect(breaks("UILocalizedIndexedCollation")).toBe("UI|Localized^Indexed^Collation");
    expect(breaks("macOS and tvOS")).toBe("macOS and tvOS");
  });

  it("escapes the title's text", () => {
    expect(breaks("Uncertain<T>")).toBe("Uncertain&lt;T&gt;");
  });
});
