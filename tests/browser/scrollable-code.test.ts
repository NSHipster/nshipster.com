import { afterEach, describe, expect, it } from "vite-plus/test";
import { setUpScrollableCode } from "../../src/scripts/scrollable-code.ts";

let observer: ResizeObserver | undefined;

/** Waits for the ResizeObserver callbacks that follow a layout change. */
const nextFrames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

function listing(text: string, attributes = ""): HTMLElement {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<pre class="highlight" style="width: 200px; overflow: auto; white-space: pre"${attributes}><code>${text}</code></pre>`,
  );
  return document.body.lastElementChild as HTMLElement;
}

afterEach(() => {
  observer?.disconnect();
  document.body.innerHTML = "";
});

describe("scrollable code", () => {
  it("puts only listings that scroll in the tab order", async () => {
    const wide = listing("x".repeat(200));
    const narrow = listing("x");
    observer = setUpScrollableCode();
    await nextFrames();
    expect(wide.tabIndex).toBe(0);
    expect(narrow.hasAttribute("tabindex")).toBe(false);
  });

  it("updates the tab order when a listing's width changes", async () => {
    const element = listing("x".repeat(40));
    observer = setUpScrollableCode();
    await nextFrames();
    expect(element.tabIndex).toBe(0);
    element.style.width = "2000px";
    await nextFrames();
    expect(element.hasAttribute("tabindex")).toBe(false);
  });

  it("leaves listings in tab panels alone", async () => {
    const panel = listing("x", ' role="tabpanel" tabindex="0"');
    observer = setUpScrollableCode();
    await nextFrames();
    expect(panel.tabIndex).toBe(0);
  });
});
