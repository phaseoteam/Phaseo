import test from "node:test";
import assert from "node:assert/strict";
import { displayWidth, hyperlink, renderTable, terminalSupportsHyperlinks } from "../src/output.ts";
import { keysPageUrl, modelPageUrl, providerPageUrl, requestPageUrl } from "../src/links.ts";
import { filterPricingRoutes, formatConditions, formatUnit, meterLabel, renderPricingDetails, renderPricingTable, type PricingRoute } from "../src/pricing.ts";
import { formatTimestamp, formatUsd, renderModelTable } from "../src/index.ts";

test("renderTable aligns columns under a header", () => {
	const out = renderTable(
		[{ name: "Prod", cost: "$1.50" }, { name: "Backup key", cost: "$12.00" }],
		[{ header: "NAME", value: (row) => row.name }, { header: "COST", value: (row) => row.cost, align: "right" }],
		{ color: false },
	);
	assert.equal(out, `NAME${" ".repeat(10)}COST\nProd${" ".repeat(9)}$1.50\nBackup key  $12.00\n`);
});

test("renderTable handles empty lists, missing values and control characters", () => {
	assert.equal(renderTable([], [{ header: "A", value: () => "x" }]), "No results.\n");
	const out = renderTable([{ a: null, b: "x\u001b[31m\ny" }], [{ header: "A", value: (row) => row.a }, { header: "B", value: (row) => row.b }], { color: false });
	assert.equal(out, "A  B\n-  x [31m y\n");
});

test("renderTable shrinks the widest shrinkable column to fit", () => {
	const rows = [{ id: "abc", name: "a very long workspace name indeed" }];
	const out = renderTable(rows, [{ header: "NAME", value: (row) => row.name, shrink: true }, { header: "ID", value: (row) => row.id }], { color: false, maxWidth: 20 });
	for (const line of out.trimEnd().split("\n")) assert.ok(line.length <= 20, line);
	assert.match(out, /…/);
	assert.match(out, /abc$/m);
});

test("displayWidth counts terminal columns", () => {
	assert.equal(displayWidth("abc"), 3);
	assert.equal(displayWidth("日本"), 4);
	assert.equal(displayWidth("🚀"), 2);
	assert.equal(displayWidth("🇬🇧"), 2);
	assert.equal(displayWidth("1️⃣"), 2);
	assert.equal(displayWidth("👩‍💻"), 2);
	assert.equal(displayWidth("é"), 1);
});

test("renderTable aligns wide characters by terminal columns", () => {
	const rows = [{ name: "日本語キー", id: "a" }, { name: "Prod 🚀", id: "b" }, { name: "plain", id: "c" }];
	const out = renderTable(rows, [{ header: "NAME", value: (row) => row.name }, { header: "ID", value: (row) => row.id }], { color: false });
	const idColumns = out.trimEnd().split("\n").slice(1).map((line) => displayWidth(line.slice(0, line.lastIndexOf(" ") + 1)));
	assert.deepEqual(new Set(idColumns).size, 1, out);
	const cut = renderTable([{ name: "日本語キー名前", id: "a" }], [{ header: "NAME", value: (row) => row.name, shrink: true }, { header: "ID", value: (row) => row.id }], { color: false, maxWidth: 12 });
	for (const line of cut.trimEnd().split("\n")) assert.ok(displayWidth(line) <= 12, line);
	assert.match(cut, /…/);
});

test("money and time cells", () => {
	assert.equal(formatUsd(1234.5), "$1,234.50");
	assert.equal(formatUsd(0.000006762), "$0.00000676");
	assert.equal(formatUsd(0), "$0.00");
	assert.equal(formatUsd(null), "-");
	assert.equal(formatTimestamp("2026-11-16T21:41:37.795409+00:00"), "2026-11-16 21:41:37");
});

test("model table shows modalities and context", () => {
	const out = renderModelTable([{ id: "openai/gpt-6-luna", name: "GPT-6 Luna", availability: { status: "active", active_provider_count: 3 }, modalities: { input: ["text", "image"], output: ["text"] }, limits: { input_tokens: 400000 } }], { color: false });
	assert.match(out, /^MODEL\s+NAME\s+STATUS\s+PROVIDERS\s+INPUT\s+OUTPUT\s+CONTEXT$/m);
	assert.match(out, /openai\/gpt-6-luna\s+GPT-6 Luna\s+active\s+3\s+text, image\s+text\s+400,000/);
});

const ROUTES: PricingRoute[] = [
	{
		provider: "openai",
		model: "openai/gpt-6-luna",
		endpoint: "text.generate",
		display_name: "GPT-6 Luna",
		meters: [
			{ meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.1", currency: "USD" },
			{ meter: "cached_read_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.01", currency: "USD" },
			{ meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.5", currency: "USD" },
			{ meter: "native_web_search_requests", unit: "request", unit_size: 1000, price_per_unit: "10", currency: "USD" },
		],
	},
	{
		provider: "alibaba-cloud",
		model: "qwen/qwen-flash",
		endpoint: "text.generate",
		meters: [
			{ meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.05", conditions: [{ op: "lte", path: "input_tokens", value: 256000, or_group: 1, and_index: 1 }] },
			{ meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.25", conditions: [{ op: "gt", path: "input_tokens", value: 256000, or_group: 1, and_index: 1 }] },
			{ meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.4", time_windows: [{ label: "Busy hours", start_time: "00:00", end_time: "14:00", timezone: "UTC", price_per_unit: "0.8" }] },
		],
	},
	{
		provider: "openai",
		model: "openai/gpt-image-2",
		endpoint: "image.generate",
		meters: [{ meter: "output_image", unit: "image", unit_size: 1, price_per_unit: "0.04" }],
	},
];

test("pricing table shows input, output, cache and other prices", () => {
	const out = renderPricingTable(ROUTES, { color: false });
	assert.match(out, /^MODEL\s+PROVIDER\s+ENDPOINT\s+INPUT\s+OUTPUT\s+CACHE READ\s+OTHER$/m);
	assert.match(out, /openai\/gpt-6-luna\s+openai\s+text\.generate\s+\$0\.10\/M\s+\$0\.50\/M\s+\$0\.01\/M\s+Web search \$10\.00\/1K requests/);
	assert.match(out, /qwen\/qwen-flash\s+alibaba-cloud\s+text\.generate\s+from \$0\.05\/M\s+from \$0\.40\/M\s+-\s+-/);
	assert.match(out, /openai\/gpt-image-2\s+openai\s+image\.generate\s+-\s+-\s+-\s+Output image \$0\.04\/image/);
});

test("pricing details list every meter with its conditions", () => {
	const out = renderPricingDetails([ROUTES[1]], { color: false });
	assert.match(out, /^\(qwen\/qwen-flash\) via alibaba-cloud, text\.generate$/m);
	assert.match(out, /Input text\s+\$0\.05\s+per 1M tokens\s+input tokens ≤ 256,000/);
	assert.match(out, /Input text\s+\$0\.25\s+per 1M tokens\s+input tokens > 256,000/);
	assert.match(out, /Output text\s+\$0\.40\s+per 1M tokens\s+Busy hours 00:00–14:00 UTC: \$0\.80/);
});

test("pricing shows the service tier when a route has more than the standard one", () => {
	const tiered: PricingRoute[] = [
		{ ...ROUTES[0], service_tier: "standard" },
		{ ...ROUTES[0], service_tier: "priority", meters: [{ meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.2" }] },
	];
	const out = renderPricingTable(tiered, { color: false });
	assert.match(out, /^MODEL\s+PROVIDER\s+ENDPOINT\s+TIER\s+INPUT/m);
	assert.match(out, /text\.generate\s+priority\s+\$0\.20\/M/);
	assert.doesNotMatch(renderPricingTable([{ ...ROUTES[0], service_tier: "standard" }], { color: false }), /TIER/);
	assert.match(renderPricingDetails([tiered[1]], { color: false }), /via openai, text\.generate, priority tier$/m);
	assert.deepEqual(filterPricingRoutes(tiered, { tier: "prio" }).map((route) => route.service_tier), ["priority"]);
});

test("pricing details sort the lower prompt-size tier first, input before output", () => {
	const route: PricingRoute = {
		provider: "openai", model: "openai/gpt-x", endpoint: "text.generate",
		meters: [
			{ meter: "output_text_tokens", unit: "token", unit_size: 1e6, price_per_unit: "3", conditions: [{ op: "gt", path: "input_tokens", value: 272000 }] },
			{ meter: "input_text_tokens", unit: "token", unit_size: 1e6, price_per_unit: "2", conditions: [{ op: "gt", path: "input_tokens", value: 272000 }] },
			{ meter: "output_text_tokens", unit: "token", unit_size: 1e6, price_per_unit: "1.5", conditions: [{ op: "lte", path: "input_tokens", value: 272000 }] },
			{ meter: "input_text_tokens", unit: "token", unit_size: 1e6, price_per_unit: "1", conditions: [{ op: "lte", path: "input_tokens", value: 272000 }] },
		],
	};
	const prices = [...renderPricingDetails([route], { color: false }).matchAll(/\$(\d\.\d\d)/g)].map((match) => match[1]);
	assert.deepEqual(prices, ["1.00", "1.50", "2.00", "3.00"]);
});

test("time windows show weekdays and keep the meter price when they have none", () => {
	const route: PricingRoute = {
		provider: "p", model: "a/b", endpoint: "text.generate",
		meters: [{ meter: "input_text_tokens", unit: "token", unit_size: 1e6, price_per_unit: "0.5", time_windows: [{ label: "Weekdays", days_of_week: ["mon", "fri"], start_time: "09:00", end_time: "17:00", timezone: "UTC", price_per_unit: null }] }],
	};
	assert.match(renderPricingDetails([route], { color: false }), /Weekdays mon, fri 09:00–17:00 UTC: \$0\.50/);
	assert.match(renderPricingTable([route], { color: false }), /from \$0\.50\/M/);
});

test("conditions read like the pricing engine evaluates them", () => {
	// Legacy { key, operator } rows (Upstage document-parse enhanced mode).
	assert.equal(formatConditions([{ key: "mode", operator: "eq", value: "enhanced" }]), "mode = enhanced");
	// Ungrouped conditions join explicit group 1, so they are ANDed with it, not alternatives.
	assert.equal(
		formatConditions([{ op: "eq", path: "tier", value: "pro" }, { op: "gt", path: "input_tokens", value: 1000, or_group: 1 }, { op: "lte", path: "input_tokens", value: 10, or_group: 2 }]),
		"tier = pro and input tokens > 1,000 or input tokens ≤ 10",
	);
});

test("price summaries keep the unit of the cheapest entry", () => {
	const route: PricingRoute = {
		provider: "p", model: "a/b", endpoint: "text.generate",
		meters: [
			{ meter: "input_text_tokens", unit: "token", unit_size: 1e6, price_per_unit: "1", conditions: [{ op: "lte", path: "input_tokens", value: 100 }] },
			{ meter: "input_text_tokens", unit: "token", unit_size: 1e3, price_per_unit: "0.002", conditions: [{ op: "gt", path: "input_tokens", value: 100 }] },
		],
	};
	// $1/M is cheaper per token than $0.002/K ($2/M).
	assert.match(renderPricingTable([route], { color: false }), /from \$1\.00\/M/);
});

test("pricing get prefers the exact model over longer names", () => {
	const routes: PricingRoute[] = [
		{ provider: "openai", model: "openai/gpt-6-luna", endpoint: "text.generate", meters: [] },
		{ provider: "openai", model: "openai/gpt-6-luna-pro", endpoint: "text.generate", meters: [] },
	];
	assert.deepEqual(filterPricingRoutes(routes, { model: "gpt-6-luna", preferExactModel: true }).map((route) => route.model), ["openai/gpt-6-luna"]);
	assert.equal(filterPricingRoutes(routes, { model: "gpt-6-luna" }).length, 2);
	assert.equal(filterPricingRoutes(routes, { model: "luna", preferExactModel: true }).length, 2);
});

test("hyperlink support is detected per terminal and can be forced", () => {
	assert.equal(terminalSupportsHyperlinks({ isTTY: true, env: { WT_SESSION: "1" } }), true);
	assert.equal(terminalSupportsHyperlinks({ isTTY: true, env: { TERM_PROGRAM: "vscode" } }), true);
	assert.equal(terminalSupportsHyperlinks({ isTTY: true, env: { VTE_VERSION: "7200" } }), true);
	assert.equal(terminalSupportsHyperlinks({ isTTY: true, env: {} }), false, "unknown terminal");
	assert.equal(terminalSupportsHyperlinks({ isTTY: false, env: { WT_SESSION: "1" } }), false, "piped");
	assert.equal(terminalSupportsHyperlinks({ isTTY: true, env: { WT_SESSION: "1", NO_HYPERLINKS: "" } }), false);
	assert.equal(terminalSupportsHyperlinks({ isTTY: false, env: { FORCE_HYPERLINK: "1" } }), true);
	assert.equal(terminalSupportsHyperlinks({ isTTY: true, env: { WT_SESSION: "1", FORCE_HYPERLINK: "0" } }), false);
});

test("hyperlinks wrap only the visible text and only https URLs", () => {
	assert.equal(hyperlink("gpt", "https://phaseo.app/models/openai/gpt"), "\u001b]8;;https://phaseo.app/models/openai/gpt\u001b\\gpt\u001b]8;;\u001b\\");
	assert.equal(hyperlink("x", "javascript:alert(1)"), "x");
	assert.equal(hyperlink("x", "not a url"), "x");
	const rows = [{ model: "openai/gpt-6-luna", cost: "$1.00" }];
	const columns = [
		{ header: "MODEL", value: (row: typeof rows[0]) => row.model, link: (row: typeof rows[0]) => modelPageUrl(row.model) },
		{ header: "COST", value: (row: typeof rows[0]) => row.cost, align: "right" as const },
	];
	const linked = renderTable(rows, columns, { color: false, links: true });
	const plain = renderTable(rows, columns, { color: false, links: false });
	assert.match(linked, /\u001b\]8;;https:\/\/phaseo\.app\/models\/openai\/gpt-6-luna\u001b\\openai\/gpt-6-luna\u001b\]8;;\u001b\\/);
	// Same layout once the escape codes are removed.
	assert.equal(linked.replace(/\u001b\]8;;[^\u001b]*\u001b\\/g, ""), plain);
	assert.doesNotMatch(plain, /\u001b/);
});

test("pricing tables carry links; detail titles stay sanitised", () => {
	const linked = renderPricingTable([ROUTES[0]], { color: false, links: true });
	assert.match(linked, /\u001b\]8;;https:\/\/phaseo\.app\/models\/openai\/gpt-6-luna\u001b\\openai\/gpt-6-luna\u001b\]8;;\u001b\\/);
	assert.match(linked, /\u001b\]8;;https:\/\/phaseo\.app\/api-providers\/openai\u001b\\openai\u001b\]8;;\u001b\\/);
	const hostile = renderPricingDetails([{ ...ROUTES[0], display_name: "Luna\u001b[31m" }], { color: false, links: false });
	assert.doesNotMatch(hostile, /\u001b/);
});

test("web page URLs", () => {
	assert.equal(modelPageUrl("openai/gpt-6-luna", {}), "https://phaseo.app/models/openai/gpt-6-luna");
	assert.equal(modelPageUrl("no-slash", {}), undefined);
	assert.equal(providerPageUrl("alibaba-cloud", { PHASEO_WEB_URL: "https://staging.phaseo.app/" }), "https://staging.phaseo.app/api-providers/alibaba-cloud");
	assert.equal(requestPageUrl("G-01M7", "ws 1", {}), "https://phaseo.app/settings/usage/logs/requests/G-01M7?workspaceId=ws%201");
	assert.equal(keysPageUrl({}), "https://phaseo.app/settings/keys");
});

test("pricing helpers", () => {
	assert.equal(meterLabel("cached_write_text_tokens_5m"), "Cache write text (5m)");
	assert.equal(meterLabel("input_audio_seconds"), "Input audio seconds");
	assert.equal(formatUnit({ unit: "second", unit_size: 60 }), "per 60 seconds");
	assert.equal(formatConditions([{ op: "gt", path: "input_tokens", value: 200000, or_group: 1, and_index: 1 }, { op: "lte", path: "input_tokens", value: 1000000, or_group: 1, and_index: 2 }]), "input tokens > 200,000 and input tokens ≤ 1,000,000");
	assert.deepEqual(filterPricingRoutes(ROUTES, { model: "luna" }).map((route) => route.model), ["openai/gpt-6-luna"]);
	assert.deepEqual(filterPricingRoutes(ROUTES, { provider: "openai", endpoint: "image" }).map((route) => route.model), ["openai/gpt-image-2"]);
});
