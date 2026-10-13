import type { APIRoute } from "astro";
import { site } from "../lib/site.ts";

/** The `humans.txt` file, dated with the build date in the site time zone. */
export const GET: APIRoute = () => {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: site.timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((parts, part) => ({ ...parts, [part.type]: part.value }), {});

  const body = `/* TEAM */

Managing Editor: Mattt
Site: https://mat.tt
Contact: mattt [at] nshipster.com
Twitter: @mattt
Location: Portland, OR, United States

/* SITE */

Last update: ${date.year}/${date.month}/${date.day}
Language: ${site.lang}
Standards: HTML5, CSS3, WAI-ARIA
Software: Astro
IDE: Visual Studio Code
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
