// KSeF 2.0 API base URL allowlist. `api_url` on tenants is an enum so
// callers can never inject arbitrary hosts. Response-returned URLs
// (e.g., export download links) are verified with `assertKsefUrl`
// before being fetched — SSRF guard.

export const KSEF_BASE_URLS = {
  production: "https://api.ksef.mf.gov.pl",
  test: "https://api-test.ksef.mf.gov.pl",
  demo: "https://api-demo.ksef.mf.gov.pl",
} as const satisfies Record<string, string>;

export type KsefEnv = keyof typeof KSEF_BASE_URLS;

export function ksefBaseUrl(env: KsefEnv): string {
  return KSEF_BASE_URLS[env];
}

const ALLOWED_SUFFIX = ".mf.gov.pl";

export function assertKsefUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`invalid URL: ${raw}`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`KSeF URL must use https: ${raw}`);
  }
  const host = url.hostname.toLowerCase();
  if (host !== "mf.gov.pl" && !host.endsWith(ALLOWED_SUFFIX)) {
    throw new Error(`KSeF URL host not in allowlist (*.mf.gov.pl): ${raw}`);
  }
  // Reject userinfo, embedded credentials, or unusual ports.
  if (url.username || url.password) {
    throw new Error(`KSeF URL must not contain credentials: ${raw}`);
  }
  if (url.port && url.port !== "443") {
    throw new Error(`KSeF URL must use the default HTTPS port: ${raw}`);
  }
  return url;
}
