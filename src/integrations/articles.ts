import type { AstroIntegration } from "astro";
import { downloadArticles } from "../lib/content/articles.ts";

/**
 * Downloads the English articles before content collections load,
 * so that both the Markdown and the Markdoc article collections read the same copy.
 */
export function articles(): AstroIntegration {
  return {
    name: "nshipster:articles",
    hooks: {
      "astro:config:setup": async ({ logger }) => {
        await downloadArticles(logger);
      },
    },
  };
}
