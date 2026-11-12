import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

test("canonical extraction capability stays distinct from decisions", async () => {
  const sql = await readFile(new URL("../schemas/public/functions/canonical_routing_capability_id.sql", import.meta.url), "utf8");
  const definition = sql.slice(0, sql.indexOf("$$;") + 3);
  const db = new PGlite();
  try {
    await db.exec(definition);
    const result = await db.query("select public.canonical_routing_capability_id('extraction.extract') as extraction, public.canonical_routing_capability_id('decisions.make') as decisions, public.canonical_routing_capability_id('extraction.unknown') as unsupported");
    assert.deepEqual(result.rows[0], { extraction: "extraction.extract", decisions: "decisions.make", unsupported: null });
  } finally { await db.close(); }
});
