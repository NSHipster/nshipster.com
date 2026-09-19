import { defineConfig } from "astro/config";
import { staticFiles } from "./src/integrations/static-files.ts";
import { markdownProcessor } from "./src/lib/render/markdown.ts";

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
  integrations: [staticFiles()],
  devToolbar: { enabled: false },
  vite: {
    build: {
      // Keep scripts external: the Content-Security-Policy blocks inline scripts.
      assetsInlineLimit: (file) => (file.endsWith(".js") ? false : undefined),
    },
    server: {
      watch: {
        ignored: [
          "**/.context/**",
          "**/_site/**",
          "**/.jekyll-cache/**",
          "**/vendor/**",
          "**/collections/{es,fr,ko,ru,zh-Hans}/**",
        ],
      },
    },
  },
});
