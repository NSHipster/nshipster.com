import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import { STORAGE_KEY, setUpTabs } from "../../src/scripts/code-tabs.ts";

/** Markup produced by the HTML transformations for two consecutive listings. */
function group(number: number, languages: string[]): string {
  const slug = (language: string) => language.toLowerCase();
  const tabs = languages
    .map(
      (language, index) =>
        `<button role="tab" id="code-listing-${number}-${slug(language)}-tab" class="${slug(language)}" aria-controls="code-listing-${number}-${slug(language)}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${language}</button>`,
    )
    .join("");
  const panels = languages
    .map(
      (language, index) =>
        `<pre class="highlight" data-lang="${language}" id="code-listing-${number}-${slug(language)}" role="tabpanel" tabindex="0" aria-labelledby="code-listing-${number}-${slug(language)}-tab"${index === 0 ? "" : " hidden"}><code>${language} code</code></pre>`,
    )
    .join("");
  return `<div class="highlight-group"><div role="tablist" aria-label="Languages">${tabs}</div>${panels}</div>`;
}

const tab = (id: string) => document.getElementById(id) as HTMLButtonElement;
const panel = (id: string) => document.getElementById(id) as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML =
    group(1, ["Swift", "Objective-C"]) + group(2, ["Swift", "Objective-C"]) + group(3, ["JSON", "XML", "Terminal"]);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("code tabs", () => {
  it("selects a tab on click and shows its panel", async () => {
    setUpTabs();
    await userEvent.click(tab("code-listing-3-xml-tab"));
    expect(tab("code-listing-3-xml-tab").getAttribute("aria-selected")).toBe("true");
    expect(panel("code-listing-3-xml").hidden).toBe(false);
    expect(panel("code-listing-3-json").hidden).toBe(true);
  });

  it("applies a Swift or Objective-C choice to every group and remembers it", async () => {
    setUpTabs();
    await userEvent.click(tab("code-listing-1-objective-c-tab"));
    expect(panel("code-listing-2-objective-c").hidden).toBe(false);
    expect(panel("code-listing-2-swift").hidden).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("objective-c");
  });

  it("restores the remembered language", () => {
    localStorage.setItem(STORAGE_KEY, "objective-c");
    setUpTabs();
    expect(panel("code-listing-1-objective-c").hidden).toBe(false);
    expect(tab("code-listing-2-objective-c-tab").tabIndex).toBe(0);
  });

  it("moves between tabs with the arrow, Home, and End keys", async () => {
    setUpTabs();
    tab("code-listing-3-json-tab").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(tab("code-listing-3-xml-tab"));
    expect(panel("code-listing-3-xml").hidden).toBe(false);

    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(tab("code-listing-3-terminal-tab"));
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(tab("code-listing-3-json-tab"));
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(tab("code-listing-3-terminal-tab"));
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(tab("code-listing-3-json-tab"));
  });

  it("keeps only the selected tab in the tab order", async () => {
    setUpTabs();
    await userEvent.click(tab("code-listing-3-terminal-tab"));
    const tabIndexes = ["json", "xml", "terminal"].map((language) => tab(`code-listing-3-${language}-tab`).tabIndex);
    expect(tabIndexes).toEqual([-1, -1, 0]);
  });

  it("works when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(() => setUpTabs()).not.toThrow();
    await userEvent.click(tab("code-listing-1-objective-c-tab"));
    expect(panel("code-listing-2-objective-c").hidden).toBe(false);
  });
});
