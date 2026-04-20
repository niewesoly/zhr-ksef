import { suite, test } from "node:test";
import { strict as assert } from "node:assert";
import { fmtDate, fmtMoney, fmtMoneyStr, fmtQty, isSafeUrl, buildAdresLines } from "../../src/visualization/format.js";

suite("fmtDate", () => {
  test("null returns em dash", () => {
    assert.equal(fmtDate(null), "—");
  });

  test("undefined returns em dash", () => {
    assert.equal(fmtDate(undefined), "—");
  });

  test("valid ISO date formats correctly", () => {
    assert.equal(fmtDate("2026-04-15"), "15.04.2026");
  });

  test("short date without zero-padding returns em dash", () => {
    assert.equal(fmtDate("2026-4-5"), "—");
  });

  test("non-date string returns em dash", () => {
    assert.equal(fmtDate("not-a-date"), "—");
  });

  test("empty string returns em dash", () => {
    assert.equal(fmtDate(""), "—");
  });

  test("date with extra content returns em dash", () => {
    assert.equal(fmtDate("2026-04-15T00:00:00"), "—");
  });
});

suite("fmtMoney", () => {
  test("null returns em dash", () => {
    assert.equal(fmtMoney(null, "PLN"), "—");
  });

  test("undefined returns em dash", () => {
    assert.equal(fmtMoney(undefined, "PLN"), "—");
  });

  test("zero formats with two decimal places", () => {
    assert.equal(fmtMoney(0, "PLN"), "0.00 PLN");
  });

  test("integer amount formats with two decimal places", () => {
    assert.equal(fmtMoney(100, "PLN"), "100.00 PLN");
  });

  test("decimal amount rounds to two places", () => {
    assert.equal(fmtMoney(1234.5, "PLN"), "1234.50 PLN");
  });

  test("non-PLN currency is appended", () => {
    assert.equal(fmtMoney(99.99, "EUR"), "99.99 EUR");
  });

  test("null currency omitted (no trailing space)", () => {
    assert.equal(fmtMoney(10, null), "10.00");
  });

  test("undefined currency omitted (no trailing space)", () => {
    assert.equal(fmtMoney(10, undefined), "10.00");
  });
});

suite("fmtMoneyStr", () => {
  test("null returns em dash", () => {
    assert.equal(fmtMoneyStr(null, "PLN"), "—");
  });

  test("zero string formats with two decimal places", () => {
    assert.equal(fmtMoneyStr("0", "PLN"), "0.00 PLN");
  });

  test("decimal string formats with two decimal places", () => {
    assert.equal(fmtMoneyStr("123.40", "EUR"), "123.40 EUR");
  });

  test("null currency omitted (no trailing space)", () => {
    assert.equal(fmtMoneyStr("100", null), "100.00");
  });

  test("undefined currency omitted (no trailing space)", () => {
    assert.equal(fmtMoneyStr("100", undefined), "100.00");
  });

  test("integer string formats with two decimal places", () => {
    assert.equal(fmtMoneyStr("99", "PLN"), "99.00 PLN");
  });

  test("non-numeric string returns em dash", () => {
    assert.equal(fmtMoneyStr("not-a-number", "PLN"), "—");
  });
});

suite("fmtQty", () => {
  test("null returns em dash", () => {
    assert.equal(fmtQty(null), "—");
  });

  test("undefined returns em dash", () => {
    assert.equal(fmtQty(undefined), "—");
  });

  test("zero returns '0'", () => {
    assert.equal(fmtQty(0), "0");
  });

  test("integer returns string without decimal", () => {
    assert.equal(fmtQty(5), "5");
  });

  test("fractional quantity retains decimals", () => {
    assert.equal(fmtQty(3.5), "3.5");
  });

  test("large integer is stringified", () => {
    assert.equal(fmtQty(1000), "1000");
  });
});

suite("isSafeUrl", () => {
  test("https URL returns true", () => {
    assert.equal(isSafeUrl("https://pay.example.com"), true);
  });

  test("http URL returns false", () => {
    assert.equal(isSafeUrl("http://x"), false);
  });

  test("javascript scheme returns false", () => {
    assert.equal(isSafeUrl("javascript:alert(1)"), false);
  });

  test("empty string returns false", () => {
    assert.equal(isSafeUrl(""), false);
  });

  test("data URI returns false", () => {
    assert.equal(isSafeUrl("data:text/html,<script>"), false);
  });

  test("ftp URL returns false", () => {
    assert.equal(isSafeUrl("ftp://files.example.com"), false);
  });
});

suite("buildAdresLines", () => {
  const dummyKraj = (code: string | null) => (code === "PL" ? "Polska" : null);

  test("null adres returns empty array", () => {
    assert.deepEqual(buildAdresLines(null, dummyKraj), []);
  });

  test("all fields present builds three lines", () => {
    const lines = buildAdresLines(
      { adresL1: "ul. Testowa 1", adresL2: "00-001 Warszawa", kodKraju: "PL" },
      dummyKraj,
    );
    assert.deepEqual(lines, ["ul. Testowa 1", "00-001 Warszawa", "Polska"]);
  });

  test("null adresL2 is omitted", () => {
    const lines = buildAdresLines(
      { adresL1: "ul. Testowa 1", adresL2: null, kodKraju: "PL" },
      dummyKraj,
    );
    assert.deepEqual(lines, ["ul. Testowa 1", "Polska"]);
  });

  test("unknown country code omitted when krajFn returns null", () => {
    const lines = buildAdresLines(
      { adresL1: "Via Roma 1", adresL2: "00100 Roma", kodKraju: "IT" },
      dummyKraj,
    );
    assert.deepEqual(lines, ["Via Roma 1", "00100 Roma"]);
  });

  test("whitespace-only fields are omitted", () => {
    const lines = buildAdresLines(
      { adresL1: "  ", adresL2: "Some City", kodKraju: null },
      dummyKraj,
    );
    assert.deepEqual(lines, ["Some City"]);
  });

  test("all null fields returns empty array", () => {
    const lines = buildAdresLines(
      { adresL1: null, adresL2: null, kodKraju: null },
      dummyKraj,
    );
    assert.deepEqual(lines, []);
  });
});
