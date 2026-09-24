import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

/**
 * Vite+ configuration for formatting, linting, and tests.
 * The site itself is built by Astro with `astro.config.ts`.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: "browser",
          include: ["tests/browser/**/*.test.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
      {
        test: {
          name: "site",
          include: ["tests/site/**/*.test.ts"],
          environment: "node",
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
  lint: {
    ignorePatterns: ["dist/**", "assets/**", "collections/**", ".context/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    printWidth: 120,
    ignorePatterns: [
      "dist/**",
      "assets/**",
      "_i18n/**",
      "_bibliography/**",
      "collections/**",
      ".context/**",
      ".well-known/**",
      "*.md",
      "*.html",
      "*.xml",
      "tests/reference/**",
      "tests/fixtures/**",
      "src/data/**",
    ],
  },
});
