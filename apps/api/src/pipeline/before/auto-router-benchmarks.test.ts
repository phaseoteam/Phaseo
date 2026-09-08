import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import * as runtime from "@/runtime/env";
import { loadAutoRouterBenchmarks } from "./auto-router";

afterEach(() => vi.restoreAllMocks());

it("excludes withdrawn benchmark scores from service-role routing inputs", async () => {
	const current = { model_slug: "model/current", benchmark_id: "gpqa-diamond", score_numeric: 50 };
	const withdrawn = { model_slug: "model/withdrawn", benchmark_id: "gpqa-diamond", score_numeric: 100 };
	const client = createClient("https://catalogue.example.test", "test-service-role", {
		auth: { persistSession: false },
		global: { fetch: async (input) => {
			const query = new URL(String(input)).searchParams;
			const activeWindow = query.get("or") ?? "";
			const filtersRetired = /^\(effective_to\.is\.null,effective_to\.gt\.\d{4}-/.test(activeWindow);
			return new Response(JSON.stringify(filtersRetired ? [current] : [current, withdrawn]), {
				headers: { "Content-Type": "application/json" },
			});
		} },
	});
	vi.spyOn(runtime, "getSupabaseAdmin").mockReturnValue(client);
	expect(await loadAutoRouterBenchmarks(["model/current", "model/withdrawn"], ["gpqa-diamond"]))
		.toEqual([current]);
});
