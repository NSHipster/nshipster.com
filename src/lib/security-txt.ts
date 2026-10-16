/**
 * How long a `security.txt` file stays valid after a request.
 * RFC 9116 recommends less than a year, so that a stale file doesn't stay valid for long.
 */
export const SECURITY_TXT_LIFETIME_MS = 364 * 24 * 60 * 60 * 1000;

/**
 * The `security.txt` file (RFC 9116), which expires a fixed time after `now`.
 * The Worker in `src/worker.ts` serves it at `/.well-known/security.txt`.
 */
export function securityTxt(now: Date): string {
  // Remove milliseconds, which the RFC 9116 examples don't use.
  const expires = new Date(now.getTime() + SECURITY_TXT_LIFETIME_MS).toISOString().replace(/\.\d+Z$/, "Z");
  return [
    "Contact: https://github.com/NSHipster/nshipster.com/security/advisories/new",
    `Expires: ${expires}`,
    "Preferred-Languages: en",
    "Canonical: https://nshipster.com/.well-known/security.txt",
    "",
  ].join("\n");
}
