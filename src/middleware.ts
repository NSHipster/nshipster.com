import { defineMiddleware } from "astro:middleware";
import { withCitations } from "./lib/render/citations.ts";

export const onRequest = defineMiddleware((_context, next) => {
  return withCitations(next);
});
