# NSHipster.com

[NSHipster](https://nshipster.com) is a journal of the overlooked bits in
Swift, Objective-C and Cocoa.

This repository hosts the source code that generates and deploys
[NSHipster.com](https://nshipster.com) and its translations.
For the articles themselves,
see [this repository](https://github.com/nshipster/articles).

---

## Requirements

- Git
- [mise](https://mise.jdx.dev), which installs the pinned version of Node.js
  (`brew install mise`)

## Running Locally

Clone the repository, then set it up:

```terminal
$ git clone git@github.com:NSHipster/nshipster.com.git
$ cd nshipster.com
$ mise run setup
```

Setup installs Node.js,
checks out the English articles at the revision recorded in this repository,
and installs the locked dependencies.
It's safe to run again.

Start the development server with:

```terminal
$ mise run dev
```

The server listens on port 4321,
or on `CONDUCTOR_PORT` when run from a Conductor workspace.
Changes to articles, the bibliography, and assets are picked up while it runs.

Run `mise tasks` to see every task.
The most common ones are:

| Task                        | Description                                                |
| --------------------------- | ---------------------------------------------------------- |
| `mise run build`            | Build the static site into `dist/`                         |
| `mise run check`            | Check formatting, lint, and types                          |
| `mise run test:unit`        | Run unit and rendering fixture tests                       |
| `mise run test:browser`     | Run browser tests for scripts and the built site           |
| `mise run check:site`       | Check the built site for broken links and other problems   |
| `mise run preview`          | Serve `dist/` with Cloudflare's local runtime              |
| `mise run content:update`   | Update the English articles to the latest published commit |

## How the Site Is Built

NSHipster.com is built with [Astro](https://astro.build).
Articles are rendered in the same order as the previous Jekyll site:
Liquid tags (with [LiquidJS](https://liquidjs.com)),
then Markdown (with Astro's Unified processor),
then HTML transformations such as heading anchors and code listing tabs.
The rendering code lives in `src/lib/render/`.

Articles were written for Kramdown,
so `src/lib/render/kramdown.ts` and `src/lib/render/markdown.ts`
reproduce the Kramdown behavior that articles rely on,
including Markdown inside HTML elements, header IDs,
definition lists, and paragraph wrapping in lists.
Code is highlighted with [Shiki](https://shiki.style),
and citations are formatted with [Citation.js](https://citation.js.org)
from `_bibliography/references.bib`.

Files in `assets/` are published under `/assets/` with content-hashed names.
Use them in articles with the `{% asset %}` tag, as before.

### Comparing with the Jekyll Site

`tests/reference/` records facts about the last Jekyll build of the site:
its routes, canonical URLs, feed entry IDs, heading anchors, and asset references.
`mise run reference:compare` checks the Astro build against them.
To also compare the text and structure of every page,
build the Jekyll site and pass its output directory:

```terminal
$ node scripts/compare-reference.ts path/to/jekyll/_site
```

Reviewed differences are listed with their reasons
in `tests/reference/accepted-differences.json`.

## Translations

The translated sites (NSHipster.cn, NSHipster.es, and others)
are still built with Jekyll,
using the configuration files in `_config/`:

```terminal
$ bundle install
$ bundle exec jekyll serve --config _config/default.yml,_config/$DOMAIN.yml
```

## Deploying

NSHipster.com is served by
[Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/).
`wrangler.jsonc` configures trailing-slash handling and the 404 page;
the build writes `_redirects` and `_headers` into `dist/`.

After CI passes on `master`,
the Deploy workflow publishes the site to production.
To check a build first,
run the Deploy workflow for the `preview` environment,
or deploy from your machine:

```terminal
$ mise run deploy:preview
```

Deployment requires the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

## Contact

Follow NSHipster on Twitter
([@NSHipster](https://twitter.com/NSHipster))

## License

All code is published under the
[MIT License](https://opensource.org/licenses/MIT).

All content is released under the
[Creative Commons BY-NC License](https://creativecommons.org/licenses/by-nc/4.0/).

NSHipster® and the NSHipster Logo
are registered trademarks of Read Evaluate Press, LLC.
