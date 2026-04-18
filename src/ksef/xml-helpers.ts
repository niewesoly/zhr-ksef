// Shared helpers for KSeF XML parsers. Not part of the public API.

export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function toFiniteNumber(val: unknown): number | null {
  if (val == null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/** Finds a field ignoring XML namespace prefixes (e.g. fa:NIP → NIP). */
export function findField(obj: Record<string, unknown>, fieldName: string): unknown {
  if (fieldName in obj) return obj[fieldName];
  for (const key of Object.keys(obj)) {
    if (key.endsWith(`:${fieldName}`)) return obj[key];
  }
  return undefined;
}

export function findFieldRecord(
  obj: Record<string, unknown>,
  fieldName: string,
): Record<string, unknown> | undefined {
  const val = findField(obj, fieldName);
  return isRecord(val) ? val : undefined;
}

export function findFieldString(obj: Record<string, unknown>, fieldName: string): string | null {
  const val = findField(obj, fieldName);
  if (val == null) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

export function findFieldNumber(obj: Record<string, unknown>, fieldName: string): number | null {
  return toFiniteNumber(findField(obj, fieldName));
}

/** Normalises a parsed XML value that may be a single record or an array. */
export function toArray(val: unknown): Record<string, unknown>[] {
  if (Array.isArray(val)) return val.filter(isRecord);
  if (isRecord(val)) return [val];
  return [];
}
