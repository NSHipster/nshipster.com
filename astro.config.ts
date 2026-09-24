import { defineConfig, fontProviders } from "astro/config";
import { staticFiles } from "./src/integrations/static-files.ts";
import { markdownProcessor } from "./src/lib/render/markdown.ts";

/** A Merriweather face from `assets/fonts`, in WOFF2 and WOFF. */
const merriweather = (file: string, weight: number, style: "normal" | "italic") => ({
  src: [`./assets/fonts/Merriweather-${file}.woff2`, `./assets/fonts/Merriweather-${file}.woff`] as [string, string],
  weight,
  style,
});

export default defineConfig({
  site: "https://nshipster.com",
  output: "static",
  // Keep `status.html` at `/status` while articles use `/slug/index.html`.
  build: { format: "preserve" },
  trailingSlash: "ignore",
  markdown: {
    processor: markdownProcessor(),
    // Code is highlighted by the processor's own Shiki plugin.
    syntaxHighlight: false,
  },
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Merriweather",
      cssVariable: "--font-merriweather",
      fallbacks: ["Georgia", "serif"],
      formats: ["woff2", "woff"],
      // Keep the text hidden briefly while fonts load, as the site did before.
      display: "auto",
      options: {
        variants: [
          merriweather("Light", 300, "normal"),
          merriweather("LightItalic", 300, "italic"),
          merriweather("Regular", 400, "normal"),
          merriweather("Italic", 400, "italic"),
          merriweather("Bold", 700, "normal"),
          merriweather("BoldItalic", 700, "italic"),
          merriweather("Black", 900, "normal"),
          merriweather("BlackItalic", 900, "italic"),
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "Creative Commons Symbols",
      cssVariable: "--font-creative-commons",
      fallbacks: [],
      formats: ["woff2", "woff"],
      options: {
        variants: [
          {
            src: ["./assets/fonts/CreativeCommonsSymbols.woff2", "./assets/fonts/CreativeCommonsSymbols.woff"],
            weight: 400,
            style: "normal",
            unicodeRange: ["U+1F10D-1F10F", "U+1F16D-1F16F"],
          },
        ],
      },
    },
  ],
  integrations: [staticFiles()],
  devToolbar: { enabled: false },
  vite: {
    build: {
      // Keep scripts external: the Content-Security-Policy blocks inline scripts.
      assetsInlineLimit: (file) => (file.endsWith(".js") ? false : undefined),
    },
    server: {
      watch: {
        ignored: ["**/.context/**"],
      },
    },
  },
});
