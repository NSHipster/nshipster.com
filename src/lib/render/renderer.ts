import type { MarkdownRenderer } from "./index.ts";
import { markdownProcessor } from "./markdown.ts";

let renderer: Promise<MarkdownRenderer> | undefined;

/**
 * A Markdown renderer from the site's processor, for components and pages
 * that render fragments outside a content loader.
 */
export function processorRenderer(): Promise<MarkdownRenderer> {
  renderer ??= markdownProcessor()
    .createRenderer({ syntaxHighlight: false })
    .then((instance) => async (markdown: string) => (await instance.render(`\n${markdown}`)).code);
  return renderer;
}
