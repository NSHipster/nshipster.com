import { describe, expect, it } from "vite-plus/test";
import { stripHTML } from "../../src/lib/text.ts";

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
