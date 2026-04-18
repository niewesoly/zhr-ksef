import { eq } from "drizzle-orm";
import { invoiceEvents, invoices } from "../db/schema.js";
import type { Tx } from "../db/index.js";
import {
  type InvoiceAction,
  InvalidTransitionError,
  type InvoiceStatus,
  nextStatus,
} from "./state-machine.js";

export interface TransitionInput {
  tenantId: string;
  invoiceId: string;
  action: InvoiceAction;
  actor?: string;
  metadata?: Record<string, unknown>;
}

export interface TransitionResult {
  id: string;
  fromStatus: InvoiceStatus;
  toStatus: InvoiceStatus;
  eventId: string;
}

/** Transitions an invoice and records the event in `invoice_events`.
 *  Must run inside a tenant-scoped transaction (RLS). Returns 404 semantics
 *  by returning null when the invoice doesn't exist or isn't visible. */
export async function transitionInvoice(
  tx: Tx,
  input: TransitionInput,
): Promise<TransitionResult | null> {
  const [current] = await tx
    .select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, input.invoiceId))
    .limit(1);

  if (!current) return null;

  const fromStatus = current.status as InvoiceStatus;
  const toStatus = nextStatus(fromStatus, input.action);

  // Compare-and-swap on status: if two concurrent transitions race, the
  // second one sees a no-op (changedRows === 0) and we throw the same
  // InvalidTransitionError the handler uses for stale reads.
  const updated = await tx
    .update(invoices)
    .set({ status: toStatus, updatedAt: new Date() })
    .where(eq(invoices.id, input.invoiceId))
    .returning({ id: invoices.id });

  if (updated.length === 0) {
    throw new InvalidTransitionError(fromStatus, input.action);
  }

  const mergedMetadata = input.metadata ?? {};

  const [event] = await tx
    .insert(invoiceEvents)
    .values({
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      fromStatus,
      toStatus,
      actor: input.actor ?? null,
      metadata: mergedMetadata,
    })
    .returning({ id: invoiceEvents.id });

  return {
    id: input.invoiceId,
    fromStatus,
    toStatus,
    eventId: event!.id,
  };
}
