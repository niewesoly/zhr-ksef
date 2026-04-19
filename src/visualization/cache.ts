// Small in-process cache for rendered HTML/PDF bytes. Evicts the oldest
// entry when the byte budget or entry count is exceeded. Shared between
// request and worker paths.
//
// This is intentionally process-local — it works for a single API
// replica. Scaling horizontally means moving hot renders to a shared
// blob store (e.g., Postgres bytea table or S3). The Map keying already
// includes the tenant id so cross-tenant leakage is impossible at lookup.

interface CacheEntry {
  buf: Buffer;
  contentType: string;
  size: number;
}

const MAX_ENTRIES = 200;
const MAX_BYTES = 128 * 1024 * 1024;

const store = new Map<string, CacheEntry>();
let totalBytes = 0;

export function renderKey(
  tenantId: string,
  invoiceId: string,
  format: "html" | "pdf" | "pdf-wk",
): string {
  return `${tenantId}:${invoiceId}:${format}`;
}

export function getRender(key: string): CacheEntry | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  // LRU: re-insert to move to end.
  store.delete(key);
  store.set(key, entry);
  return entry;
}

export function setRender(key: string, buf: Buffer, contentType: string): void {
  const existing = store.get(key);
  if (existing) {
    store.delete(key);
    totalBytes -= existing.size;
  }

  const entry: CacheEntry = { buf, contentType, size: buf.byteLength };
  store.set(key, entry);
  totalBytes += entry.size;

  while (store.size > MAX_ENTRIES || totalBytes > MAX_BYTES) {
    const oldestKey = store.keys().next().value;
    if (!oldestKey) break;
    const oldest = store.get(oldestKey);
    if (!oldest) break;
    store.delete(oldestKey);
    totalBytes -= oldest.size;
  }
}

export function invalidateRender(tenantId: string, invoiceId: string): void {
  for (const format of ["html", "pdf", "pdf-wk"] as const) {
    const key = renderKey(tenantId, invoiceId, format);
    const entry = store.get(key);
    if (entry) {
      store.delete(key);
      totalBytes -= entry.size;
    }
  }
}
