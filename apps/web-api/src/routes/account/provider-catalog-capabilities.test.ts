import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalCatalogCapability } from "./provider-catalog-capabilities";

describe("catalog capability parity with promotion", () => {
	it("matches every alias and canonical identifier in the SQL routing function", () => {
		const sql = readFileSync(new URL("../../../../../supabase/schemas/public/functions/canonical_routing_capability_id.sql", import.meta.url), "utf8");
		const aliases = [...sql.matchAll(/when '([^']+)' then '([^']+)'/g)];
		expect(aliases.length).toBeGreaterThan(20);
		for (const [, alias, canonical] of aliases) expect(canonicalCatalogCapability(alias)).toBe(canonical);
		const ids = sql.match(/any\(array\[([\s\S]*?)\]\)/)![1];
		for (const [, id] of ids.matchAll(/'([^']+)'/g)) expect(canonicalCatalogCapability(id)).toBe(id);
		expect(canonicalCatalogCapability(" AUDIO/TRANSCRIBE ")).toBe("audio.transcription");
		expect(canonicalCatalogCapability("unsupported.capability")).toBeNull();
	});
});
