import { describe, expect, it } from "vite-plus/test";
import { highlight, languageLabel } from "../../src/lib/render/highlight.ts";

describe("syntax highlighting", () => {
  it("labels languages like the previous site", () => {
    expect(languageLabel("swift")).toBe("Swift");
    expect(languageLabel("objc")).toBe("Objective-C");
    expect(languageLabel("json-ld")).toBe("JSON-LD");
    expect(languageLabel("xcconfig")).toBe("Xcode Build Settings");
    expect(languageLabel("terminal")).toBe("Terminal");
    expect(languageLabel(undefined)).toBe("plaintext");
    expect(languageLabel("obj-c")).toBe("obj-c");
  });

  it("uses Pygments-style classes for Swift tokens", async () => {
    const html = await highlight('let s = "hello" // comment', "swift");
    expect(html).toBe(
      '<span class="kd">let</span> s <span class="o">=</span> <span class="s2">"hello"</span> <span class="c1">// comment</span>\n',
    );
  });

  it("preserves code text", async () => {
    const code = 'if let x = y { print("\\(x) < 1 && > 0") }\n';
    const html = await highlight(code, "swift");
    const text = html
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    expect(text).toBe(code);
  });

  it("highlights terminal sessions, JWTs, and Xcode build settings", async () => {
    expect(await highlight("$ swift build\nOutput", "terminal")).toContain('<span class="gp">$</span>');
    expect(await highlight("aaa.bbb.ccc", "jwt")).toBe(
      '<span class="k">aaa</span><span class="p">.</span><span class="m">bbb</span><span class="p">.</span><span class="nv">ccc</span>\n',
    );
    expect(await highlight("SWIFT_VERSION = 5.0", "xcconfig")).toContain('<span class="nv">SWIFT_VERSION</span>');
  });

  it("escapes code in unknown languages", async () => {
    expect(await highlight("<b>x</b>", "unknown")).toBe("&lt;b&gt;x&lt;/b&gt;");
  });
});
