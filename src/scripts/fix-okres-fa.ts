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
  const rows = await sql<
    { id: string; ksef_number: string; tenant_id: string; invoice_xml: string }[]
  >`
    SELECT id, ksef_number, tenant_id, invoice_xml
    FROM invoices
    WHERE invoice_xml IS NOT NULL
      AND (
        parsed_data->>'okresFa' ILIKE '%object object%'
        OR parsed_data->>'okresFaKorygowanej' ILIKE '%object object%'
        OR jsonb_typeof(parsed_data->'okresFa') = 'object'
        OR jsonb_typeof(parsed_data->'okresFaKorygowanej') = 'object'
      )
  `;

  console.log(`Found ${rows.length} invoice(s) to repair.`);

  let repaired = 0;
  for (const row of rows) {
    try {
      const parsed = parseInvoiceFa3(row.invoice_xml, row.ksef_number);
      await sql`
        UPDATE invoices
        SET parsed_data = ${sql.json(JSON.parse(JSON.stringify(parsed)))},
            updated_at  = now()
        WHERE id = ${row.id}
      `;
      repaired++;
      console.log(`  ✓ ${row.ksef_number} (tenant ${row.tenant_id})`);
    } catch (err) {
      console.error(`  ✗ ${row.ksef_number}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nDone. Repaired ${repaired}/${rows.length} invoice(s).`);
} finally {
  await sql.end();
}
