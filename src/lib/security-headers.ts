/**
 * Security headers for every response.
 *
 * The build writes them into the `/*` rule of Cloudflare's `_headers` file,
 * and the Worker in `src/worker.ts` adds them to the responses it creates,
 * because `_headers` rules don't apply to those,
 * and to the responses it passes on from the static assets if they're missing.
 *
 * `Content-Security-Policy` allows the YouTube videos that some articles embed with `frame-src`,
 * and MapKit JS in the `/mapkit-js` article, which runs its map renderer in a `blob:` worker.
 *
 * `Permissions-Policy` disables powerful features that no page uses.
 * It leaves features such as `fullscreen` and `encrypted-media` unrestricted
 * for the YouTube videos that some articles embed.
 *
 * `Cross-Origin-Resource-Policy: same-origin` keeps other sites from loading pages as subresources.
 *
 * This module has no Node.js imports, so that the Worker can use it.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' https://*.apple-mapkit.com; style-src 'self' 'unsafe-inline'; img-src 'self' https://*.apple-mapkit.com; frame-src https://www.youtube-nocookie.com; frame-ancestors 'none'; object-src 'none'; connect-src 'self' https://*.apple-mapkit.com; base-uri 'none'; worker-src blob:; upgrade-insecure-requests",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy":
    "bluetooth=(), browsing-topics=(), camera=(), display-capture=(), geolocation=(), hid=(), idle-detection=(), local-fonts=(), microphone=(), midi=(), payment=(), screen-wake-lock=(), serial=(), usb=(), xr-spatial-tracking=()",
  "Referrer-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};
