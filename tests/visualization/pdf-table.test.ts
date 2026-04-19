import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { tableCell, tableRow, tableHeader, tableContainer } from "../../src/visualization/pdf-table.js";

describe("pdf-table", () => {
  describe("tableCell", () => {
    test("returns a ReactElement with Text type", () => {
      const el = tableCell("hello", { width: "30%" });
      assert.ok(el, "must return an element");
      const t = el.type as { name?: string; displayName?: string };
      const typeName = t.name ?? t.displayName ?? String(el.type);
      assert.equal(typeName.toUpperCase(), "TEXT");
    });

    test("applies right alignment for numeric cells", () => {
      const el = tableCell("123.45", { width: "20%", align: "right" });
      const p = el.props as { style: object | object[] };
      const style = Array.isArray(p.style) ? p.style : [p.style];
      const merged = Object.assign({}, ...style);
      assert.equal(merged.textAlign, "right");
    });
  });

  describe("tableRow", () => {
    test("returns a View with flexDirection row", () => {
      const cells = [
        tableCell("A", { width: "50%" }),
        tableCell("B", { width: "50%" }),
      ];
      const row = tableRow(cells, { index: 0 });
      assert.ok(row, "must return an element");
      const p = row.props as { style: object | object[] };
      const style = Array.isArray(p.style) ? p.style : [p.style];
      const merged = Object.assign({}, ...style);
      assert.equal(merged.flexDirection, "row");
    });

    test("even rows get zebra background", () => {
      const cells = [tableCell("A", { width: "100%" })];
      const row = tableRow(cells, { index: 0 });
      const p = row.props as { style: object | object[] };
      const style = Array.isArray(p.style) ? p.style : [p.style];
      const merged = Object.assign({}, ...style);
      assert.equal(merged.backgroundColor, "#f7f7f7");
    });

    test("odd rows have no zebra background", () => {
      const cells = [tableCell("A", { width: "100%" })];
      const row = tableRow(cells, { index: 1 });
      const p = row.props as { style: object | object[] };
      const style = Array.isArray(p.style) ? p.style : [p.style];
      const merged = Object.assign({}, ...style);
      assert.equal(merged.backgroundColor, undefined);
    });
  });

  describe("tableHeader", () => {
    test("returns a View with header background color", () => {
      const cells = [
        tableCell("Name", { width: "50%", isHeader: true }),
        tableCell("Value", { width: "50%", isHeader: true }),
      ];
      const header = tableHeader(cells);
      const p = header.props as { style: object | object[] };
      const style = Array.isArray(p.style) ? p.style : [p.style];
      const merged = Object.assign({}, ...style);
      assert.equal(merged.backgroundColor, "#e8e8e8");
    });
  });

  describe("tableContainer", () => {
    test("wraps header and rows in a View with top border", () => {
      const header = tableHeader([tableCell("H", { width: "100%", isHeader: true })]);
      const rows = [tableRow([tableCell("R", { width: "100%" })], { index: 0 })];
      const container = tableContainer(header, rows);
      assert.ok(container, "must return an element");
      const p = container.props as { style: object | object[] };
      const style = Array.isArray(p.style) ? p.style : [p.style];
      const merged = Object.assign({}, ...style);
      assert.equal(merged.borderTopWidth, 0.5);
    });
  });
});
