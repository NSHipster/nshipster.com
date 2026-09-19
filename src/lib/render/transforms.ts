import type { Element, ElementContent, Root, RootContent, Text } from "hast";
import { fromHtml } from "hast-util-from-html";
import { selectAll, select } from "hast-util-select";
import { toHtml } from "hast-util-to-html";
import { toString } from "hast-util-to-string";
import { site } from "../site.ts";
import { EMPTY_HEADER } from "./kramdown.ts";
import { parameterize } from "./markdown.ts";

/**
 * HTML transformations applied after Markdown rendering.
 * These port the Nokogiri transformations from the Jekyll site's Markdown converter.
 */

const PLACEHOLDER = "￼";

export interface TransformOptions {
  /** Add the `get-on-with-it` anchor after the first rule or second-level heading. */
  delineate?: boolean;
}

export function transformHTML(html: string, options: TransformOptions = {}): string {
  const tree = fromHtml(html, { fragment: true });
  parents = undefined;

  removeProprietaryAttributes(tree);
  secureCrossOriginLinks(tree);
  transformAppleTrademarks(tree);
  removeEmptyTableHeaders(tree);
  transformPlaceholderTokens(tree);
  transformCodeSymbols(tree);
  addHeadingAnchors(tree);
  convertFootnotes(tree);
  consolidateCodeListings(tree);
  improveAccessibility(tree);
  styleOptionalPlaceholders(tree);
  if (options.delineate !== false) delineateFlimFlam(tree);

  return toHtml(tree, {
    allowDangerousHtml: true,
    closeSelfClosing: false,
    characterReferences: { useNamedReferences: true },
  }).replaceAll(PLACEHOLDER, '<var class="placeholder">…</var>');
}

function className(node: Element): string[] {
  const value = node.properties.className;
  return Array.isArray(value) ? value.map(String) : [];
}

function removeProprietaryAttributes(tree: Root): void {
  for (const node of selectAll("[markdown]", tree)) delete node.properties.markdown;
}

function secureCrossOriginLinks(tree: Root): void {
  const origin = new URL(site.url).origin;
  for (const a of selectAll("a[href]", tree)) {
    const href = String(a.properties.href);
    try {
      if (new URL(href, site.url).origin === origin) continue;
    } catch {
      // Treat malformed links as external.
    }
    a.properties.rel = ["noopener", "noreferrer"];
  }
}

/** Replaces the text nodes among an element's descendants. */
function mapText(
  node: Element | Root,
  transform: (text: Text, parent: Element | Root) => ElementContent[] | undefined,
): void {
  const children = node.children as Array<RootContent>;
  for (let index = 0; index < children.length; index++) {
    const child = children[index]!;
    if (child.type === "text") {
      const replacement = transform(child, node);
      if (replacement) {
        children.splice(index, 1, ...(replacement as RootContent[]));
        index += replacement.length - 1;
      }
    } else if (child.type === "element") {
      mapText(child, transform);
    }
  }
}

function transformAppleTrademarks(tree: Root): void {
  for (const node of selectAll("p, li, td", tree)) {
    mapText(node, (text) => {
      if (!/iPhone X[SR]/.test(text.value)) return undefined;
      const parts: ElementContent[] = [];
      let last = 0;
      for (const match of text.value.matchAll(/iPhone X([SR])/g)) {
        parts.push({ type: "text", value: text.value.slice(last, match.index) + "iPhone X" });
        parts.push({
          type: "element",
          tagName: "small",
          properties: {},
          children: [{ type: "text", value: match[1]! }],
        });
        last = match.index! + match[0].length;
      }
      parts.push({ type: "text", value: text.value.slice(last) });
      return parts;
    });
  }
}

/** Removes the header rows added to header-less tables before Markdown parsing. */
function removeEmptyTableHeaders(tree: Root): void {
  for (const table of selectAll("table", tree)) {
    const head = select("thead", table);
    if (!head || toString(head).replaceAll(EMPTY_HEADER, "").trim() !== "") continue;
    table.children = table.children.filter((child) => child !== head);
  }
}

/** Lets inline code wrap between camel-case words. */
function transformCodeSymbols(tree: Root): void {
  for (const code of selectAll("code", tree)) {
    if (isInside(tree, code, "pre")) continue;
    delete code.properties.className;
    mapText(code, (text) => {
      if (!/[a-z][A-Z]/.test(text.value)) return undefined;
      const parts: ElementContent[] = [];
      const segments = text.value.split(/(?<=[a-z])(?=[A-Z])/);
      segments.forEach((segment, index) => {
        if (index > 0) parts.push({ type: "element", tagName: "wbr", properties: {}, children: [] });
        parts.push({ type: "text", value: segment });
      });
      return parts;
    });
  }
  parents = undefined;
}

let parents: WeakMap<object, Element | Root> | undefined;

function indexParents(tree: Root): void {
  parents = new WeakMap();
  const walk = (node: Element | Root) => {
    for (const child of node.children) {
      parents!.set(child, node);
      if (child.type === "element") walk(child);
    }
  };
  walk(tree);
}

function isInside(tree: Root, node: Element, tagName: string): boolean {
  if (!parents) indexParents(tree);
  let current = parents!.get(node);
  while (current && current.type === "element") {
    if (current.tagName === tagName) return true;
    current = parents!.get(current);
  }
  return false;
}

/**
 * Converts `<# placeholder #>` tokens in inline code and HTML code elements.
 * Highlighted code blocks handle placeholders before highlighting.
 */
function transformPlaceholderTokens(tree: Root): void {
  for (const code of selectAll("code", tree)) {
    mapText(code, (text) => {
      if (!/<#[\s\S]*?#>/.test(text.value)) return undefined;
      const parts: ElementContent[] = [];
      let last = 0;
      for (const match of text.value.matchAll(/<#\s*([\s\S]*?)\s*#>/g)) {
        parts.push({ type: "text", value: text.value.slice(last, match.index) });
        parts.push(placeholder(match[1]!));
        last = match.index! + match[0].length;
      }
      parts.push({ type: "text", value: text.value.slice(last) });
      return parts;
    });
  }
}

export function placeholder(name: string): Element {
  return {
    type: "element",
    tagName: "var",
    properties: { className: ["placeholder"] },
    children: [{ type: "text", value: name }],
  };
}

/**
 * Moves heading IDs into anchors, as `add_heading_anchors!` did.
 * Only headings with Kramdown or explicit HTML IDs get anchors;
 * IDs that Astro assigned to the other headings are removed.
 */
function addHeadingAnchors(tree: Root): void {
  const used = new Set<string>();
  for (const heading of selectAll("h1, h2, h3, h4, h5, h6", tree)) {
    const marked = heading.properties.dataKramdownId !== undefined;
    const id = heading.properties.id;
    delete heading.properties.dataKramdownId;
    delete heading.properties.id;
    if (!marked || typeof id !== "string" || !id) continue;
    // A repeated ID keeps its first occurrence, which is where links already lead.
    let anchor = parameterize(id);
    for (let suffix = 2; used.has(anchor); suffix++) anchor = `${parameterize(id)}-${suffix}`;
    used.add(anchor);
    heading.children.unshift({
      type: "element",
      tagName: "a",
      properties: { className: ["anchor"], ariaHidden: "true", id: anchor, href: `#${anchor}` },
      children: [],
    });
  }
}

/** Rewrites GFM footnotes into the markup and IDs that Kramdown produced. */
function convertFootnotes(tree: Root): void {
  const section = select("section[data-footnotes]", tree);
  if (!section) return;
  indexParents(tree);
  const name = (target: string) => decodeURIComponent(target.replace(/^#?user-content-fn(?:ref)?-/, ""));
  const references = new Map<string, number>();

  for (const ref of selectAll("a[data-footnote-ref]", tree)) {
    const label = name(String(ref.properties.href));
    const occurrence = references.get(label) ?? 0;
    references.set(label, occurrence + 1);
    const referenceID = `fnref:${label}${occurrence > 0 ? `:${occurrence}` : ""}`;
    const sup = parents?.get(ref);
    ref.properties = { href: `#fn:${label}`, className: ["footnote"], rel: ["footnote"] };
    if (sup && sup.type === "element" && sup.tagName === "sup") {
      sup.properties = { id: referenceID, role: "doc-noteref" };
    }
  }
  for (const item of selectAll("li[id]", section)) {
    const label = name(String(item.properties.id));
    item.properties = { id: `fn:${label}`, role: "doc-endnote" };
    selectAll("a[data-footnote-backref]", item).forEach((back, index) => {
      back.properties = {
        href: `#fnref:${label}${index > 0 ? `:${index}` : ""}`,
        className: ["reversefootnote"],
        role: "doc-backlink",
      };
      back.children = [{ type: "text", value: "↩" }];
      if (index > 0) {
        back.children.push({
          type: "element",
          tagName: "sup",
          properties: {},
          children: [{ type: "text", value: String(index + 1) }],
        });
      }
    });
  }
  const list = select("ol", section)!;
  section.tagName = "div";
  section.properties = { className: ["footnotes"], role: "doc-endnotes" };
  section.children = [list];
  parents = undefined;
}

/** Groups consecutive code listings into tabbed groups. */
function consolidateCodeListings(tree: Root): void {
  let number = 1;
  const visit = (node: Element | Root) => {
    const children = node.children as RootContent[];
    const result: RootContent[] = [];
    for (let index = 0; index < children.length; index++) {
      const child = children[index]!;
      if (child.type === "element") visit(child);
      if (!isListing(child)) {
        result.push(child);
        continue;
      }
      const listings: Element[] = [child as Element];
      let lookahead = index + 1;
      while (lookahead < children.length) {
        const next = children[lookahead]!;
        if (next.type === "text" && !next.value.trim()) {
          lookahead++;
          continue;
        }
        if (!isListing(next)) break;
        listings.push(next as Element);
        index = lookahead;
        lookahead++;
      }
      if (listings.length === 1) {
        result.push(child);
        continue;
      }
      result.push(codeGroup(listings, number++));
    }
    node.children = result as never;
  };
  visit(tree);
}

function isListing(node: RootContent): boolean {
  return node.type === "element" && node.tagName === "pre" && className(node).includes("highlight");
}

function codeGroup(listings: Element[], number: number): Element {
  const tabs: Element[] = [];
  const used = new Map<string, number>();
  listings.forEach((pre, index) => {
    const language = String(pre.properties.dataLang || "text");
    // Listings in the same language within a group get distinct IDs.
    const slug = language.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    const base = `code-listing-${number}-${slug}`;
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    const id = count > 1 ? `${base}-${count}` : base;
    pre.properties = {
      ...pre.properties,
      id,
      role: "tabpanel",
      tabIndex: 0,
      ariaLabelledby: `${id}-tab`,
      ...(index === 0 ? {} : { hidden: true }),
    };
    tabs.push({
      type: "element",
      tagName: "button",
      properties: {
        role: "tab",
        id: `${id}-tab`,
        className: [slug],
        ariaControls: [id],
        ariaSelected: index === 0 ? "true" : "false",
        tabIndex: index === 0 ? 0 : -1,
      },
      children: [{ type: "text", value: language }],
    });
  });
  return {
    type: "element",
    tagName: "div",
    properties: { className: ["highlight-group"] },
    children: [
      { type: "element", tagName: "div", properties: { role: "tablist", ariaLabel: "Languages" }, children: tabs },
      ...listings,
    ],
  };
}

function improveAccessibility(tree: Root): void {
  for (const img of selectAll("img", tree)) {
    if (String(img.properties.src ?? "").endsWith(".svg")) img.properties.role = "img";
    if (img.properties.alt === undefined) img.properties.alt = "";
  }
}

function styleOptionalPlaceholders(tree: Root): void {
  for (const node of selectAll("var.placeholder", tree)) {
    if (!/[[\]]/.test(toString(node))) continue;
    node.properties.className = [...className(node), "optional"];
    node.properties.title = "Optional";
    mapText(node, (text) => [{ type: "text", value: text.value.replace(/[[\]]/g, "") }]);
  }
}

/** Adds the `get-on-with-it` anchor after the introduction. */
function delineateFlimFlam(tree: Root): void {
  const divider = select("hr", tree) ?? select("h2", tree);
  if (!divider) return;
  indexParents(tree);
  const parent = parents!.get(divider)!;
  const index = parent.children.indexOf(divider as never);
  parent.children.splice(index + 1, 0, {
    type: "element",
    tagName: "a",
    properties: { id: "get-on-with-it" },
    children: [],
  } as never);
  parents = undefined;
}
