import { test } from "node:test";
import { strict as assert } from "node:assert";
import { firstOrThrow } from "../../src/db/helpers.js";

test("firstOrThrow returns first row when array is non-empty", () => {
  assert.deepStrictEqual(firstOrThrow([{ id: "a" }], "empty"), { id: "a" });
});

test("firstOrThrow returns first row when array has multiple entries", () => {
  assert.deepStrictEqual(
    firstOrThrow([{ id: "a" }, { id: "b" }], "empty"),
    { id: "a" },
  );
});

test("firstOrThrow throws Error with given message on empty array", () => {
  assert.throws(
    () => firstOrThrow([], "sync_runs insert returned empty"),
    (err: unknown) =>
      err instanceof Error && err.message === "sync_runs insert returned empty",
  );
});
