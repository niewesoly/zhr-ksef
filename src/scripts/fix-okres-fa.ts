/**
 * One-off repair script: fixes invoices stored with `okresFa` or
 * `okresFaKorygowanej` set to "[object Object]" (caused by the parser
 * not handling the `<P_6_Od>/<P_6_Do>` date-range variant).
 *
 * Usage:
 *   npx tsx --env-file=.env src/scripts/fix-okres-fa.ts
 */

import postgres from "postgres";
import { parseInvoiceFa3 } from "../ksef/parser.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
  // Fetch all tenants to iterate over them and set RLS properly
  const allTenants = await sql<{ id: string }[]>`SELECT id FROM tenants`;
  console.log(`Scanning ${allTenants.length} tenant(s) for invoices to repair...`);

  let repairedCount = 0;
  let scannedRowsCount = 0;

  for (const tenant of allTenants) {
    await sql.begin(async (tx) => {
      // 1) Set RLS context for this transaction
      await tx`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;

      // 2) Find strictly corrupted records for THIS tenant
      const rows = await tx<
        { id: string; ksef_number: string; invoice_xml: string }[]
      >`
        SELECT id, ksef_number, invoice_xml
        FROM invoices
        WHERE invoice_xml IS NOT NULL
          AND (
            parsed_data->>'okresFa' ILIKE '%object object%'
            OR parsed_data->>'okresFaKorygowanej' ILIKE '%object object%'
            OR jsonb_typeof(parsed_data->'okresFa') = 'object'
            OR jsonb_typeof(parsed_data->'okresFaKorygowanej') = 'object'
          )
      `;

      scannedRowsCount += rows.length;

      // 3) Re-parse and update
      for (const row of rows) {
        try {
          const parsed = parseInvoiceFa3(row.invoice_xml, row.ksef_number);
          await tx`
            UPDATE invoices
            SET parsed_data = ${tx.json(JSON.parse(JSON.stringify(parsed)))},
                updated_at  = now()
            WHERE id = ${row.id}
          `;
          repairedCount++;
          console.log(`  ✓ ${row.ksef_number} (tenant ${tenant.id})`);
        } catch (err) {
          console.error(`  ✗ ${row.ksef_number}: ${err instanceof Error ? err.message : err}`);
        }
      }
    });
  }

  console.log(`\nDone. Repaired ${repairedCount}/${scannedRowsCount} invoice(s).`);
} finally {
  await sql.end();
}
