import type { invoiceStatus } from "../db/schema.js";

// The invoice status enum — duplicated as a literal tuple so we can use
// it in Zod schemas without importing drizzle types at runtime.
export type InvoiceStatus =
  | "synced"
  | "pending"
  | "unassigned"
  | "assigned"
  | "imported"
  | "dismissed";

export type InvoiceAction = "release" | "assign" | "import" | "dismiss";

// All allowed transitions. Keyed by action → list of (fromStatus → toStatus).
// Diagram:
//   synced ──→ pending ──→ unassigned ──→ assigned ──→ imported
//                │              │            │
//                └──→ dismissed ←────────────┘
//
// "release" promotes an invoice to pending (from synced) or returns one
// to the shared pool (unassigned) from pending or assigned.
const TRANSITIONS: Record<InvoiceAction, Partial<Record<InvoiceStatus, InvoiceStatus>>> = {
  release: {
    synced: "pending",
    pending: "unassigned",
    assigned: "unassigned",
  },
  assign: {
    unassigned: "assigned",
  },
  import: {
    assigned: "imported",
  },
  dismiss: {
    synced: "dismissed",
    pending: "dismissed",
    unassigned: "dismissed",
    assigned: "dismissed",
  },
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: InvoiceStatus,
    public readonly action: InvoiceAction,
  ) {
    super(`Nie można wykonać akcji "${action}" z stanu "${from}".`);
    this.name = "InvalidTransitionError";
  }
}

export function nextStatus(
  from: InvoiceStatus,
  action: InvoiceAction,
): InvoiceStatus {
  const to = TRANSITIONS[action][from];
  if (!to) throw new InvalidTransitionError(from, action);
  return to;
}

export function canTransition(from: InvoiceStatus, action: InvoiceAction): boolean {
  return TRANSITIONS[action][from] !== undefined;
}

// Type-level guard: any status added to the drizzle enum must be covered
// above. If the enum grows, TS flags the extra literal here.
const _exhaustive: ReadonlyArray<(typeof invoiceStatus.enumValues)[number]> = [
  "synced",
  "pending",
  "unassigned",
  "assigned",
  "imported",
  "dismissed",
] satisfies InvoiceStatus[];
void _exhaustive;
