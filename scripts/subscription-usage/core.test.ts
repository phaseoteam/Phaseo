import assert from "node:assert/strict";
import test from "node:test";
import { buildUsageRows, diffUsage, parsePoints, type CurrentRow } from "./core";

const header = "id,plan,plan_en,billing,model,model_display,plan_gen,vendor,local_price,label,workload,list_price,price_usd,monthly_yi,real_usd_per_mtok,list_blended_usd_per_mtok,d,confidence,tier,source,note,unmetered,promo_until,data_date,data_date_kind,data_date_from";
const line = (id: string, vendor: string, model: string, price: string, yi: string, extra: Partial<Record<"billing" | "confidence" | "unmetered" | "workload" | "kind", string>> = {}) =>
	[id, "Plan", "", extra.billing ?? "subscription", model, model, "", vendor, "", "label", extra.workload ?? "measured", "\"{'input': 4.0}\"", price, yi, "0.03", "0.588", "0.05", extra.confidence ?? "high", "main", "src", "\"note, with comma\"", extra.unmetered ?? "False", "", "2026-07-30", extra.kind ?? "sample", ""].join(",");
const csv = (...lines: string[]) => `﻿${header}\n${lines.join("\n")}\n`;
const plans = [
	{ plan_uuid: "p-plus", plan_id: "chatgpt-plus", price: 20 },
	{ plan_uuid: "p-cursor", plan_id: "cursor-ultra", price: 200 },
];
const slugs = new Set(["openai/gpt-6.1-sol", "cursor/composer-2.5", "meta/muse-wonder-1.0"]);

test("parses quoted CSV fields and converts 10^8 token units", () => {
	const [point] = parsePoints(csv(line("chatgpt_plus::gpt-6.1-sol", "OpenAI", "gpt-6.1-sol", "20.0", "15.16")));
	assert.equal(point.planId, "chatgpt_plus");
	assert.equal(point.monthlyTokens, 1_516_000_000);
	assert.equal(point.note, "note, with comma");
	assert.equal(point.listBlendedUsdPerMtok, 0.588);
});

test("maps plans and models, and explains every skipped point", () => {
	const points = parsePoints(csv(
		line("chatgpt_plus::gpt-6.1-sol", "OpenAI", "gpt-6.1-sol", "20.0", "15.16"),
		line("cursor_ultra_composer_fast::composer-2.5", "Cursor", "composer-2.5", "200.0", "3.2", { workload: "standard", kind: "official" }),
		line("droid_max::gpt-6.1-sol", "OpenAI", "gpt-6.1-sol", "200.0", "25"),
		line("chatgpt_plus::gpt-9", "OpenAI", "gpt-9", "20.0", "1"),
		line("openai_sol_api", "OpenAI", "gpt-6.1-sol", "", "", { billing: "metered" }),
		line("cursor_ultra::composer-2.5", "Cursor", "composer-2.5", "200.0", "", { unmetered: "True" }),
	));
	const { rows, skipped } = buildUsageRows(points, plans, slugs);
	assert.deepEqual(rows.map((row) => [row.plan_uuid, row.model_slug, row.scenario, row.basis, row.workload]), [
		["p-plus", "openai/gpt-6.1-sol", "standard", "measured", "measured"],
		["p-cursor", "cursor/composer-2.5", "fast", "official", "standard_mix"],
	]);
	assert.deepEqual(skipped.map((item) => item.reason), ["plan not mapped", "model OpenAI/gpt-9 not in catalogue", "no measured token volume"]);
});

test("flags a plan whose source price differs from ours", () => {
	const points = parsePoints(csv(line("chatgpt_plus::gpt-6.1-sol", "OpenAI", "gpt-6.1-sol", "25.0", "15.16")));
	assert.deepEqual(buildUsageRows(points, plans, slugs).priceMismatches, [{ id: "chatgpt_plus::gpt-6.1-sol", sourcePrice: 25, ourPrice: 20 }]);
});

test("leaves unchanged rows alone, replaces changed rows, retires missing rows", () => {
	const points = parsePoints(csv(line("chatgpt_plus::gpt-6.1-sol", "OpenAI", "gpt-6.1-sol", "20.0", "15.16"), line("cursor_ultra::composer-2.5", "Cursor", "composer-2.5", "200.0", "3.2")));
	const [plus, cursor] = buildUsageRows(points, plans, slugs).rows;
	const stale: CurrentRow = { ...plus, usage_uuid: "old-muse", model_slug: "meta/muse-wonder-1.0" };
	// Numbers come back from PostgREST as strings for numeric columns.
	const unchanged = { ...plus, usage_uuid: "same", monthly_tokens: String(plus.monthly_tokens) as unknown as number };
	const changed: CurrentRow = { ...cursor, usage_uuid: "changed", monthly_tokens: 1 };
	const diff = diffUsage([unchanged, changed, stale], [plus, cursor]);
	assert.equal(diff.unchanged, 1);
	assert.deepEqual(diff.close, ["changed"]);
	assert.deepEqual(diff.insert.map((row) => row.model_slug), ["cursor/composer-2.5"]);
	assert.deepEqual(diff.removed, ["old-muse"]);
});
