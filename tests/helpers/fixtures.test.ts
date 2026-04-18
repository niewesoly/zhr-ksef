import { test } from "node:test";
import { strict as assert } from "node:assert";
import { loadFixture } from "./fixtures.js";

test("loadFixture reads sample_fa3_full.xml", () => {
  const xml = loadFixture("sample_fa3_full.xml");
  assert.match(xml, /<Faktura/);
});

test("loadFixture reads sample_fa3_extended.xml", () => {
  const xml = loadFixture("sample_fa3_extended.xml");
  assert.match(xml, /<Podmiot3/);
  assert.match(xml, /RachunekBankowyFaktora/);
});
