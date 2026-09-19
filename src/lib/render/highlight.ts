import { createHighlighter, type Highlighter, type LanguageRegistration, type ThemedToken } from "shiki";

/**
 * Syntax highlighting with Shiki.
 *
 * The site's stylesheets color code with the short Pygments-style class names
 * that Rouge produced (`k`, `kt`, `nf`, `s2`, …), including in the dark mode,
 * print, and high-contrast styles. Instead of theme colors, each token is
 * labeled with the class that corresponds to its TextMate scope.
 */

const jwt: LanguageRegistration = {
  name: "jwt",
  scopeName: "source.jwt",
  patterns: [
    {
      match: "^([A-Za-z0-9\\-_=]+)(\\.)([A-Za-z0-9\\-_=]+)(\\.?)([A-Za-z0-9\\-_.+/=]*)$",
      captures: {
        1: { name: "keyword.other.header.jwt" },
        2: { name: "punctuation.separator.jwt" },
        3: { name: "constant.numeric.payload.jwt" },
        4: { name: "punctuation.separator.jwt" },
        5: { name: "variable.other.signature.jwt" },
      },
    },
  ],
  repository: {},
};

const xcconfig: LanguageRegistration = {
  name: "xcconfig",
  scopeName: "source.xcconfig",
  patterns: [
    { match: "//.*$", name: "comment.line.double-slash.xcconfig" },
    {
      match: '^\\s*(#include\\??)\\s+(".*?")',
      captures: {
        1: { name: "meta.preprocessor.include.xcconfig" },
        2: { name: "string.quoted.double.xcconfig" },
      },
    },
    {
      match: "^\\s*([A-Za-z_][A-Za-z0-9_]*)((?:\\[[^\\]]*\\])*)\\s*(=)",
      captures: {
        1: { name: "variable.other.setting.xcconfig" },
        2: { name: "entity.other.attribute-name.condition.xcconfig" },
        3: { name: "keyword.operator.assignment.xcconfig" },
      },
    },
    {
      match: "\\$(?:\\([A-Za-z0-9_:]+\\)|\\{[A-Za-z0-9_:]+\\}|[A-Za-z0-9_]+)",
      name: "variable.other.substitution.xcconfig",
    },
    { match: '"(?:[^"\\\\]|\\\\.)*"', name: "string.quoted.double.xcconfig" },
    { match: "\\b(?:YES|NO)\\b", name: "constant.language.boolean.xcconfig" },
    { match: "\\b\\d+(?:\\.\\d+)*\\b", name: "constant.numeric.xcconfig" },
  ],
  repository: {},
};

/** Fence languages mapped to Shiki grammars. */
const GRAMMARS: Record<string, string> = {
  swift: "swift",
  objc: "objective-c",
  "obj-c": "objective-c",
  "objective-c": "objective-c",
  terminal: "shellsession",
  console: "shellsession",
  json: "json",
  "json-ld": "json",
  ruby: "ruby",
  shell: "shellscript",
  bash: "shellscript",
  sh: "shellscript",
  javascript: "javascript",
  js: "javascript",
  python: "python",
  xml: "xml",
  c: "c",
  sql: "sql",
  html: "html",
  applescript: "applescript",
  turtle: "turtle",
  ntriples: "turtle",
  sparql: "sparql",
  lisp: "common-lisp",
  yaml: "yaml",
  makefile: "makefile",
  dockerfile: "dockerfile",
  diff: "diff",
  cypher: "cypher",
  cobol: "cobol",
  fortran: "fortran-free-form",
  jwt: "jwt",
  xcconfig: "xcconfig",
};

/**
 * Display names for the language label and code tabs,
 * matching the names that the Jekyll site derived from each fence's class.
 */
export function languageLabel(fence: string | undefined): string {
  if (!fence) return "plaintext";
  const patterns: Array<[RegExp, string]> = [
    [/swift/, "Swift"],
    [/objc|objective-c/, "Objective-C"],
    [/json-ld/, "JSON-LD"],
    [/json/, "JSON"],
    [/python/, "Python"],
    [/ruby/, "Ruby"],
    [/javascript/, "JavaScript"],
    [/terminal/, "Terminal"],
    [/html/, "HTML"],
    [/xml/, "XML"],
    [/jwt/, "JWT"],
    [/applescript/, "AppleScript"],
    [/lisp/, "Lisp"],
    [/fortran/, "FORTRAN"],
    [/cobol/, "COBOL"],
    [/xcconfig/, "Xcode Build Settings"],
    [/turtle/, "Turtle"],
    [/sparql/, "SPARQL"],
    [/sql/, "SQL"],
    [/cypher/, "Cypher"],
    [/ntriples/, "N-Triples"],
  ];
  return patterns.find(([pattern]) => pattern.test(fence))?.[1] ?? fence;
}

const DECLARATION_KEYWORDS = new Set([
  "let",
  "var",
  "func",
  "class",
  "struct",
  "enum",
  "protocol",
  "extension",
  "typealias",
  "associatedtype",
  "init",
  "deinit",
  "subscript",
  "operator",
  "precedencegroup",
  "import",
  "actor",
  "macro",
  "case",
  "@interface",
  "@implementation",
  "@protocol",
  "@property",
  "@end",
  "@class",
]);

/** Returns the Pygments-style class for a token, given its scopes (outermost first). */
export function tokenClass(scopes: string[], text: string): string | undefined {
  const inner = [...scopes].reverse();
  const has = (prefix: string) => inner.find((scope) => scope === prefix || scope.startsWith(`${prefix}.`));

  if (has("comment")) return has("meta.preprocessor") ? "cp" : "c1";
  if (has("constant.character.escape")) return "se";
  if (has("punctuation.section.embedded") || has("punctuation.definition.template-expression")) return "si";
  if (has("meta.embedded") && !has("string")) {
    // Interpolated expressions are highlighted as code.
  } else if (has("string")) {
    if (has("string.regexp")) return "sr";
    if (has("string.quoted.single")) return "s1";
    return "s2";
  }
  if (has("meta.preprocessor") || has("keyword.control.directive") || has("punctuation.definition.directive"))
    return "cp";
  if (has("constant.numeric")) {
    if (/^[+-]?\d+$/.test(text)) return "mi";
    if (/^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/.test(text)) return "mf";
    if (/^0x[0-9a-f]+$/i.test(text)) return "mh";
    return "m";
  }
  if (has("constant.language") || has("constant.other.boolean")) return "kc";
  if (has("keyword.operator")) return /^[a-z]+$/.test(text.trim()) ? "k" : "o";
  if (has("storage.type") || has("storage.modifier") || has("keyword")) {
    if (has("keyword.other.header.jwt")) return "k";
    return DECLARATION_KEYWORDS.has(text.trim()) ? "kd" : "k";
  }
  if (has("variable.parameter")) return "nv";
  if (has("entity.name.function") || has("support.function") || has("meta.function-call.name")) return "nf";
  if (has("entity.name.class") || has("entity.name.type.class")) return "nc";
  if (has("entity.name.type") || has("support.type") || has("support.class") || has("entity.name.namespace"))
    return "kt";
  if (has("entity.name.tag")) return "nt";
  if (has("entity.other.attribute-name")) return "na";
  if (has("variable.parameter") || has("variable.other.signature")) return "nv";
  if (has("variable.other.setting") || has("variable.other.substitution") || has("variable.language")) return "nv";
  if (has("variable") || has("entity.name")) return "n";
  if (has("support.constant") || has("support.variable")) return "no";
  if (has("markup.inserted")) return "gi";
  if (has("markup.deleted")) return "gd";
  if (has("punctuation.definition.prompt") || has("punctuation.separator.prompt") || has("meta.prompt")) return "gp";
  if (has("meta.output")) return "go";
  if (has("punctuation")) return "p";
  return undefined;
}

/** Classes that keep their whitespace, such as spaces inside strings and comments. */
const WHITESPACE_CLASSES = new Set(["s1", "s2", "sr", "c1", "cp", "go"]);

let highlighter: Promise<Highlighter> | undefined;

function sharedHighlighter(): Promise<Highlighter> {
  highlighter ??= createHighlighter({
    themes: ["github-light"],
    langs: [...new Set(Object.values(GRAMMARS).filter((id) => id !== "jwt" && id !== "xcconfig")), jwt, xcconfig],
  });
  return highlighter;
}

const escapeHTML = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Highlights code and returns the inner HTML for a `<code>` element.
 * Unknown languages are returned as escaped text without error,
 * as they were by the previous highlighter.
 */
export async function highlight(code: string, fence: string | undefined): Promise<string> {
  const grammar = fence ? GRAMMARS[fence.toLowerCase()] : undefined;
  if (!grammar) return escapeHTML(code);

  const shiki = await sharedHighlighter();
  const lines: ThemedToken[][] = shiki.codeToTokensBase(code, {
    // Custom grammars like `jwt` are loaded by name, which Shiki's types don't include.
    lang: grammar as Parameters<Highlighter["codeToTokensBase"]>[1]["lang"],
    theme: "github-light",
    includeExplanation: "scopeName",
  });

  const output: string[] = [];
  for (const line of lines) {
    let current: { className: string | undefined; text: string } | undefined;
    const flush = () => {
      if (!current) return;
      const text = escapeHTML(current.text);
      output.push(current.className ? `<span class="${current.className}">${text}</span>` : text);
      current = undefined;
    };
    const parts = line.flatMap((token) =>
      (token.explanation ?? [{ content: token.content, scopes: [] }]).flatMap((part) => {
        // Grammars leave some punctuation unscoped; Rouge labeled it `p`.
        const scopes = part.scopes.map((scope) => scope.scopeName);
        const shell = scopes.some(
          (scope) => scope.startsWith("source.shell") || scope.startsWith("text.shell-session"),
        );
        if (shell || tokenClass(scopes, part.content) !== undefined || !/[{}()[\],;:.]/.test(part.content)) {
          return [{ content: part.content, scopes }];
        }
        return part.content
          .split(/([{}()[\],;:.]+)/)
          .filter(Boolean)
          .map((content) => ({
            content,
            scopes: /^[{}()[\],;:.]+$/.test(content) ? [...scopes, "punctuation.unscoped"] : scopes,
          }));
      }),
    );
    for (const part of parts) {
      let className = tokenClass(part.scopes, part.content);
      if (part.content.trim() === "" && !(className && WHITESPACE_CLASSES.has(className))) className = undefined;
      if (current && current.className === className) {
        current.text += part.content;
      } else {
        flush();
        current = { className, text: part.content };
      }
    }
    flush();
    output.push("\n");
  }
  // Match the previous output: the code ends with exactly one newline.
  return output.join("").replace(/\n+$/, "") + "\n";
}
