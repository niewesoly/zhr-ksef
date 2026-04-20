/**
 * Return the first element of `rows`, or throw an Error with `message` when
 * the array is empty. Use after a Drizzle `.returning()` to fail loudly if
 * the insert/update produced no row (RLS rejection, constraint violation
 * consumed by the driver, compare-and-swap miss, etc).
 */
export function firstOrThrow<T>(rows: readonly T[], message: string): T {
  const [first] = rows;
  if (first === undefined) throw new Error(message);
  return first;
}
