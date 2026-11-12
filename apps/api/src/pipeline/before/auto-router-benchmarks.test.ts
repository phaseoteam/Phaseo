import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as runtime from "@/runtime/env";
import { loadAutoRouterBenchmarks } from "./auto-router";
import { __resetTieredCacheForTests } from "@/core/tiered-cache";

beforeEach(() => __resetTieredCacheForTests());
afterEach(() => vi.restoreAllMocks());

const current = { model_slug: "model/current", benchmark_id: "gpqa-diamond", score_numeric: 50 };
const withdrawn = { model_slug: "model/withdrawn", benchmark_id: "gpqa-diamond", score_numeric: 100 };

function mockCatalogue(onQuery?: () => void) {
	const client = createClient("https://catalogue.example.test", "test-service-role", {
		auth: { persistSession: false },
		global: { fetch: async (input) => {
			onQuery?.();
			const query = new URL(String(input)).searchParams;
			const activeWindow = query.get("or") ?? "";
			const filtersRetired = /^\(effective_to\.is\.null,effective_to\.gt\.\d{4}-/.test(activeWindow);
			return new Response(JSON.stringify(filtersRetired ? [current] : [current, withdrawn]), {
				headers: { "Content-Type": "application/json" },
			});
		} },
	});
	vi.spyOn(runtime, "getSupabaseAdmin").mockReturnValue(client);
}

it("excludes withdrawn benchmark scores from service-role routing inputs", async () => {
	mockCatalogue();
	expect(await loadAutoRouterBenchmarks(["model/current", "model/withdrawn"], ["gpqa-diamond"]))
		.toEqual([current]);
});

it("serves repeat lookups from cache and filters models in memory", async () => {
	let queries = 0;
	mockCatalogue(() => { queries += 1; });
	await loadAutoRouterBenchmarks(["model/current"], ["gpqa-diamond"]);
	expect(await loadAutoRouterBenchmarks(["model/other"], ["gpqa-diamond"])).toEqual([]);
	expect(await loadAutoRouterBenchmarks(["model/current"], ["gpqa-diamond"])).toEqual([current]);
	expect(queries).toBe(1);
});
