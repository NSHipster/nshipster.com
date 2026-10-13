import { component, defineMarkdocConfig, nodes } from "@astrojs/markdoc/config";
import Markdoc, { type Node, type RenderableTreeNodes } from "@markdoc/markdoc";
const { Tag } = Markdoc;
import { unescapeHTML } from "astro/runtime/server/index.js";
const escapeHTML = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
import { languageLabel } from "./src/lib/render/highlight.ts";
import { highlightCodeBlock } from "./src/lib/render/markdown.ts";

/**
 * Consolidates consecutive code fences in an AST node's children into a codeGroup tag,
 * matching the legacy pipeline's tabbed code listings.
 */
function consolidateFences(children: Node[]): Node[] {
  const result: Node[] = [];
  let groupNumber = 1;
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    if (child.type !== "fence") {
      result.push(child);
      continue;
    }
    const group: Node[] = [child];
    let nextIndex = i + 1;
    while (nextIndex < children.length) {
      const next = children[nextIndex]!;
      if (next.type === "fence") {
        group.push(next);
        i = nextIndex;
        nextIndex++;
      } else {
        break;
      }
    }
    if (group.length === 1) {
      result.push(child);
    } else {
      result.push(new Markdoc.Ast.Node("tag", { number: groupNumber++ }, group, "codeGroup"));
    }
  }
  return result;
}

function isDivider(c: Node): boolean {
  if (c.type === "hr" || c.tag === "hr") return true;
  if (c.tag === "html-tag" && c.attributes?.name === "hr") return true;
  if (c.type === "paragraph") {
    const child = c.children?.[0]?.children?.[0];
    if (child && child.tag === "html-tag" && child.attributes?.name === "hr") return true;
    const text = child?.attributes?.content;
    if (typeof text === "string" && /^<hr\s*\/?>/i.test(text.trim())) return true;
  }
  return false;
}

/**
 * Inserts `<a id="get-on-with-it"></a>` after the first hr or h2 divider
 * if the content does not already contain an explicit anchor with that ID.
 */
function delineateFlimFlam(children: Node[]): void {
  const hasAnchor = children.some(
    (c) =>
      (c.type === "tag" && c.attributes.id === "get-on-with-it") ||
      (c.type === "inline" && c.children.some((i) => i.attributes?.id === "get-on-with-it")),
  );
  if (hasAnchor) return;
  let dividerIndex = children.findIndex(isDivider);
  if (dividerIndex === -1) {
    dividerIndex = children.findIndex((c) => c.type === "heading" && c.attributes.level === 2);
  }
  if (dividerIndex === -1) return;
  children.splice(dividerIndex + 1, 0, new Markdoc.Ast.Node("tag", {}, [], "flimflamAnchor"));
}

/**
 * Markdoc tags and nodes for converted articles.
 * Tags mirror the legacy Liquid tags and render through the same components as MDX.
 */
export default defineMarkdocConfig({
  nodes: {
    // The article layout supplies the wrapping element.
    document: {
      ...nodes.document,
      render: undefined,
      transform(node, config) {
        node.children = consolidateFences(node.children);
        delineateFlimFlam(node.children);
        return node.transformChildren(config);
      },
    },
    heading: {
      ...nodes.heading,
      render: component("./src/components/articles/Heading.astro"),
    },
    link: {
      ...nodes.link,
      render: component("./src/components/articles/ArticleLink.astro"),
    },
    code: {
      ...nodes.code,
      transform(node) {
        const content = typeof node.attributes.content === "string" ? node.attributes.content : "";
        if (!/[a-z][A-Z]/.test(content)) return new Tag("code", {}, [content]);
        const segments = content.split(/(?<=[a-z])(?=[A-Z])/);
        const children: Array<string | InstanceType<typeof Tag>> = [];
        segments.forEach((segment, index) => {
          if (index > 0) children.push(new Tag("wbr"));
          children.push(segment);
        });
        return new Tag("code", {}, children);
      },
    },
    fence: {
      attributes: nodes.fence.attributes,
      async transform(node) {
        const content = typeof node.attributes.content === "string" ? node.attributes.content : "";
        const language = typeof node.attributes.language === "string" ? node.attributes.language : undefined;
        return unescapeHTML(await highlightCodeBlock(content, language)) as unknown as RenderableTreeNodes;
      },
    },
  },
  tags: {
    info: {
      render: component("./src/components/articles/Info.astro"),
      children: ["heading", "paragraph", "list", "fence", "blockquote", "table", "hr", "image", "tag"],
    },
    warning: {
      render: component("./src/components/articles/Warning.astro"),
      children: ["heading", "paragraph", "list", "fence", "blockquote", "table", "hr", "image", "tag"],
    },
    error: {
      render: component("./src/components/articles/Error.astro"),
      children: ["heading", "paragraph", "list", "fence", "blockquote", "table", "hr", "image", "tag"],
    },
    asset: {
      render: component("./src/components/articles/AssetImage.astro"),
      selfClosing: true,
      attributes: {
        primary: { type: String },
        name: { type: String },
        alt: { type: String },
        width: { type: Number },
        height: { type: Number },
        eager: { type: Boolean },
      },
    },
    book: {
      render: component("./src/components/articles/Book.astro"),
      selfClosing: true,
      attributes: {
        primary: { type: String },
        name: { type: String },
        eager: { type: Boolean },
      },
    },
    cite: {
      render: component("./src/components/articles/Cite.astro"),
      selfClosing: true,
      inline: true,
      attributes: {
        primary: { type: String },
        keys: { type: String },
      },
    },
    bibliography: {
      render: component("./src/components/articles/Bibliography.astro"),
      selfClosing: true,
      attributes: {
        primary: { type: String },
        keys: { type: String },
        cited: { type: Boolean },
      },
    },
    codeGroup: {
      async transform(node) {
        const number = (node.attributes.number as number) || 1;
        const tabs: string[] = [];
        const panels: string[] = [];
        const used = new Map<string, number>();
        for (let index = 0; index < node.children.length; index++) {
          const child = node.children[index]!;
          const content = typeof child.attributes.content === "string" ? child.attributes.content : "";
          const fence = typeof child.attributes.language === "string" ? child.attributes.language : undefined;
          const language = languageLabel(fence);
          const slug = language.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
          const base = `code-listing-${number}-${slug}`;
          const count = (used.get(base) ?? 0) + 1;
          used.set(base, count);
          const id = count > 1 ? `${base}-${count}` : base;
          tabs.push(
            `<button role="tab" id="${id}-tab" class="${slug}" aria-controls="${id}" aria-selected="${index === 0 ? "true" : "false"}" tabindex="${index === 0 ? 0 : -1}">${escapeHTML(language)}</button>`,
          );
          panels.push(
            await highlightCodeBlock(content, fence, {
              id,
              role: "tabpanel",
              tabIndex: 0,
              ariaLabelledby: `${id}-tab`,
              hidden: index !== 0,
            }),
          );
        }
        const tablist = `<div role="tablist" aria-label="Languages">${tabs.join("")}</div>`;
        return unescapeHTML(
          `<div class="highlight-group">${tablist}${panels.join("")}</div>`,
        ) as unknown as RenderableTreeNodes;
      },
    },
    flimflamAnchor: {
      transform() {
        return unescapeHTML('<a id="get-on-with-it"></a>') as unknown as RenderableTreeNodes;
      },
    },
  },
});
