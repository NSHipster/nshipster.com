import { isScalar, parseDocument } from "yaml";
import { scalarText } from "../scalar.ts";

export interface ParsedDocument {
  data: Record<string, unknown>;
  body: string;
  /** Scalar values as written in the source, keyed by dotted path. */
  source: (path: string[]) => string | undefined;
}

/** Splits and parses YAML front matter, keeping access to scalars as written. */
export function parseFrontMatter(text: string, file: string): ParsedDocument {
  const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) throw new Error(`Missing front matter in ${file}`);
  const document = parseDocument(match[1]!, { prettyErrors: true, uniqueKeys: false });
  if (document.errors.length > 0) {
    throw new Error(`Invalid front matter in ${file}: ${document.errors.map((error) => error.message).join("; ")}`);
  }
  const data = (document.toJS() ?? {}) as Record<string, unknown>;
  return {
    data,
    body: text.slice(match[0].length),
    source: (path) => {
      const node = document.getIn(path, true);
      if (!isScalar(node)) return undefined;
      return node.source ?? (node.value == null ? undefined : scalarText(node.value));
    },
  };
}
