import { createElement as h, type ReactElement } from "react";
import { Text, View, StyleSheet } from "@react-pdf/renderer";

export interface CellOptions {
  width: string;
  align?: "left" | "right";
  isHeader?: boolean;
}

export interface RowOptions {
  index: number;
  wrap?: boolean;
}

const baseStyles = StyleSheet.create({
  cell: {
    padding: 2,
    fontSize: 8,
  },
  cellRight: {
    textAlign: "right",
  },
  headerCell: {
    fontFamily: "LiberationSans",
    fontWeight: "bold",
    fontSize: 7.5,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#bbb",
    borderStyle: "solid",
  },
  zebraEven: {
    backgroundColor: "#f7f7f7",
  },
});

const headerStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    backgroundColor: "#e8e8e8",
    borderBottomWidth: 0.75,
    borderBottomColor: "#888",
    borderStyle: "solid",
  },
});

const containerStyles = StyleSheet.create({
  table: {
    width: "100%",
    marginTop: 3,
    borderTopWidth: 0.5,
    borderTopColor: "#bbb",
    borderLeftWidth: 0.5,
    borderLeftColor: "#bbb",
    borderStyle: "solid",
  },
});

export function tableCell(text: string, opts: CellOptions): ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- style arrays are valid at runtime
  const cellStyles: any[] = [baseStyles.cell, { width: opts.width }];
  if (opts.align === "right") cellStyles.push(baseStyles.cellRight);
  if (opts.isHeader) cellStyles.push(baseStyles.headerCell);
  return h(Text, { style: cellStyles }, text);
}

export function tableRow(cells: ReactElement[], opts: RowOptions): ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- style arrays are valid at runtime
  const rowStyle: any[] = [rowStyles.row];
  if (opts.index % 2 === 0) rowStyle.push(rowStyles.zebraEven);
  return h(View, { style: rowStyle, wrap: opts.wrap ?? false }, ...cells);
}

export function tableHeader(cells: ReactElement[]): ReactElement {
  return h(View, { style: headerStyles.header, minPresenceAhead: 0.05 }, ...cells);
}

export function tableContainer(header: ReactElement, rows: ReactElement[]): ReactElement {
  return h(View, { style: containerStyles.table }, header, ...rows);
}
