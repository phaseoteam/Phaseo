import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { applyAllowlist, EXPECTATIONS_DIR, matchAllow } from "../src/expect/allowlist";
import { checkBilling, checkFinish, checkParam, checkStreamOrder, expectedBilling, expectedUsage, getPath } from "../src/expect/text";
import type { AllowEntry, Mismatch } from "../src/expect/types";
import type { ClientOutcome } from "../src/response-pipeline";
import type { PriceCard } from "@pipeline/pricing/types";

const ctx = { layer: "executor" as const, provider: "groq", family: "text", surface: "chat", caseId: "t" };

function outcome(partial: Partial<ClientOutcome>): ClientOutcome {
	return {
		mode: "stream", surface: "chat", clientUsage: null, billingUsageRaw: null, shapedUsage: null, pricing: null,
		framePricingErrors: [], finishReason: null, clientText: "", clientJson: null, frames: [], ...partial,
	} as ClientOutcome;
}

describe("expectation data", () => {
	it("every source reference resolves and every allow-list entry is justified", () => {
		const sources = JSON.parse(fs.readFileSync(path.join(EXPECTATIONS_DIR, "sources.json"), "utf8")).sources;
		const files = ["params.json", "gateway.json"].map((file) => fs.readFileSync(path.join(EXPECTATIONS_DIR, file), "utf8"));
		for (const text of files) {
			for (const match of text.matchAll(/"ref":\s*"([^"]+)"/g)) expect(sources[match[1]], match[1]).toBeDefined();
		}
		const entries = JSON.parse(fs.readFileSync(path.join(EXPECTATIONS_DIR, "allowlist.json"), "utf8")).entries as AllowEntry[];
		for (const entry of entries) {
			expect(entry.justification.length, entry.id).toBeGreaterThanOrEqual(20);
			expect(entry.finding, entry.id).toBeTruthy();
			expect(entry.fixGroup, entry.id).toBeTruthy();
		}
		expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
	});
});

describe("parameter expectations", () => {
	const scenario = { id: "chat.param.temperature", surface: "chat" as const, kind: "param" as const, param: "temperature", body: {} };
	it("passes a forwarded value and reports a dropped or changed one", () => {
		const base = { ctx, provider: "groq", dialect: "openai-chat" as const, scenario, outcome: "sent", clientBody: { temperature: 0.37 }, documented: true };
		const upstream = (body: any) => ({ url: "https://api.groq.com/openai/v1/chat/completions", method: "POST", headers: {}, body, bodyText: JSON.stringify(body) });
		expect(checkParam({ ...base, upstream: upstream({ temperature: 0.37 }) })).toEqual([]);
		expect(checkParam({ ...base, upstream: upstream({}) }).map((m) => m.kind)).toEqual(["dropped"]);
		expect(checkParam({ ...base, upstream: upstream({ temperature: 0.4 }) }).map((m) => m.kind)).toEqual(["wrong_value"]);
	});
	it("reports a documented parameter rejected before routing", () => {
		const mismatches = checkParam({ ctx, provider: "groq", dialect: "openai-chat", scenario, outcome: "rejected_validation", clientBody: { temperature: 0.37 }, documented: true });
		expect(mismatches.map((m) => [m.kind, m.path])).toEqual([["error_mapping", "client.status"]]);
	});
});

describe("response expectations", () => {
	it("maps finish reasons per surface", () => {
		expect(checkFinish(ctx, "messages", "end_turn", "length")[0]?.kind).toBe("wrong_value");
		expect(checkFinish(ctx, "messages", "max_tokens", "length")).toEqual([]);
		expect(checkFinish(ctx, "chat", null, "length")[0]?.kind).toBe("dropped");
	});

	it("checks the Messages stream grammar", () => {
		const good = outcome({ surface: "messages", frames: [{ type: "message_start" }, { type: "content_block_start", index: 0 }, { type: "content_block_delta", index: 0 }, { type: "content_block_stop", index: 0 }, { type: "message_delta" }, { type: "message_stop" }] });
		expect(checkStreamOrder(ctx, good)).toEqual([]);
		const bad = outcome({ surface: "messages", frames: [{ type: "message_start" }, { type: "content_block_start", index: 0 }, { type: "content_block_start", index: 1 }, { type: "message_stop" }] });
		expect(checkStreamOrder(ctx, bad).map((m) => m.kind)).toContain("stream_order");
	});

	it("follows Anthropic usage semantics: input excludes cache reads and writes", () => {
		const usage = expectedUsage("anthropic-messages", {});
		expect(usage.totalInput).toBe(100_003 + 20_011 + 1_013 + 2_006);
		expect(usage.write).toBe(3_019);
	});

	it("bills cache reads at the input rate when the card has no read row, and reports the shortfall in nanos", () => {
		const card = {
			provider: "groq", model: "m", endpoint: "text.generate", effective_from: null, effective_to: null, currency: "USD", version: "t",
			rules: [
				{ id: "1", pricing_plan: "standard", meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "1", currency: "USD", match: [], priority: 100 },
				{ id: "2", pricing_plan: "standard", meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "2", currency: "USD", match: [], priority: 100 },
			],
		} as unknown as PriceCard;
		const expected = expectedBilling("groq", "m", card, { totalInput: 1_000, read: 400, output: 10 }, "openai-chat")!;
		expect(expected.lines.read.rate?.fallback).toBe("input_rate");
		const mismatches = checkBilling(ctx, expected, { ok: true, lines: [{ meter: "input_text_tokens", quantity: 600, nanos: 600_000 }, { meter: "output_text_tokens", quantity: 10, nanos: 20_000 }] }, true);
		expect(mismatches.map((m) => [m.kind, m.path, m.delta?.nanos])).toEqual([["billing_under", "billing.read", -400_000]]);
	});

	it("reports writes moved between meters with the same charge as a renamed meter, not as billing", () => {
		const rate = (meter: string, perToken: number) => ({ meter, perToken });
		const none = { tokens: 0 };
		const expected = {
			lines: {
				uncachedInput: none, read: none, output: none, reasoning: none,
				write5m: { tokens: 1_000, rate: rate("cached_write_text_tokens_5m", 1.25e-6) },
				write1h: { tokens: 2_000, rate: rate("cached_write_text_tokens_1h", 2e-6) },
				write: { tokens: 0, rate: rate("cached_write_text_tokens", 1.25e-6) },
			},
		} as any;
		const moved = checkBilling(ctx, expected, { ok: true, lines: [{ meter: "cached_write_text_tokens", quantity: 3_000, nanos: 5_250_000 }] }, true);
		expect(moved.map((m) => [m.kind, m.path])).toEqual([["renamed", "billing.write.meter"]]);
		const underBilled = checkBilling(ctx, expected, { ok: true, lines: [{ meter: "cached_write_text_tokens", quantity: 3_000, nanos: 3_750_000 }] }, true);
		expect(underBilled.map((m) => m.kind)).toContain("billing_under");
	});
});

describe("allow-list gate", () => {
	const mismatch: Mismatch = { layer: "executor", kind: "dropped", provider: "anthropic", family: "text", surface: "chat", caseId: "resp:max", path: "client.citations", source: { kind: "assumed", reason: "test" } };
	it("matches exact values, lists and regexes, and counts failures", () => {
		const entries: AllowEntry[] = [{ id: "citations", justification: "Known citation loss, fixed in the stream correctness stack.", finding: "N15", fixGroup: "stream", match: { kind: "dropped", provider: ["anthropic", "openai"], path: "re:^client\\.citations" } }];
		expect(matchAllow(mismatch, entries)?.id).toBe("citations");
		const summary = applyAllowlist([{ ...mismatch }, { ...mismatch, path: "client.text" }], entries);
		expect([summary.allowed, summary.failing]).toEqual([1, 1]);
	});
	it("reads nested paths with array indexes", () => {
		expect(getPath({ tools: [{ function: { name: "x" } }] }, "tools.0.function.name")).toBe("x");
	});
});
