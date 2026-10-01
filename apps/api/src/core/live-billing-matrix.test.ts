import { describe, expect, it, vi } from "vitest";
import { LIVE_PRICE_CARD, LIVE_SEARCH_PRICE_CARD, assertLiveFinalUsage, ingestLiveUsage, priceLiveUsage, type LiveConfig, type LiveUsage } from "./live-sessions";
import { liveBackendSettingsSchema } from "./live-settings";

vi.mock("@pipeline/pricing/loader", () => ({ loadPriceCard: vi.fn() }));

// Synthetic fixture rates, not a claim about current catalog pricing. The oracle
// uses integer nanodollars and does not call the production pricing engine.
const config: LiveConfig = {
	backendModel: "openai/gpt-5.6-luna", voiceCard: LIVE_PRICE_CARD, searchCard: LIVE_SEARCH_PRICE_CARD,
	settings: liveBackendSettingsSchema.parse({ web_search: true }),
	backendCard: { ...LIVE_PRICE_CARD, model: "openai/gpt-5.6-luna", endpoint: "text.generate", rules:
		["standard", "priority", "flex"].flatMap((plan) => [
			["input_text_tokens", 0.2], ["cached_read_text_tokens", 0.02],
			["cached_write_text_tokens", 0.25], ["output_text_tokens", 1.2],
		].map(([meter, rate]) => ({ ...LIVE_PRICE_CARD.rules[0], meter: meter as "input_text_tokens",
			pricing_plan: plan, unit: "token", unit_size: 1e6,
			price_per_unit: String(Number(rate) * (plan === "priority" ? 2 : plan === "flex" ? 0.5 : 1)),
		}))) },
};

describe("Live billing independent arithmetic and replay matrix", () => {
	it.each(Array.from({ length: 100 }, (_, index) => index + 1))("reconciles varied usage, partial responses and replay after checkpoints (seed %i)", (seed) => {
		let randomState = seed;
		const random = (max: number) => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState % max; };
		let usage: LiveUsage = {};
		const ingest = (event: Record<string, unknown>) => { usage = ingestLiveUsage(JSON.parse(JSON.stringify(usage)), event); };
		const seconds = random(300) + 1;
		const count = random(8) + 1;
		let backend = 0;
		let searches = 0;
		const groups: Array<Array<Record<string, unknown>>> = [];
		ingest({ type: "session.started" });
		ingest({ type: "session.usage.updated", usage: { seconds: seconds / 2 } });
		for (let index = 0; index < count; index++) {
			const id = `response_${index}`; const delegationId = `delegation_${index}`;
			ingest({ type: "session.delegation.created", delegation: { id: delegationId, target: "responses", response_id: id } });
			const input = random(10000); const cached = random(input + 1); const written = random(input - cached + 1);
			const output = random(2000); const reasoning = random(output + 1);
			const tierIndex = random(3); const tier = ["default", "priority", "flex"][tierIndex];
			backend += ((input - cached - written) * 200 + cached * 20 + written * 250 + output * 1200) * [1, 2, 0.5][tierIndex];
			const events: Array<Record<string, unknown>> = [];
			for (let call = 0, length = random(3); call < length; call++) {
				searches++;
				const tool = { type: "response.event", delegation_id: delegationId, event: { type: "response.output_item.done",
					response_id: id, item: { id: `search_${index}_${call}`, type: "web_search_call", status: "completed" } } };
				events.push(tool, structuredClone(tool));
			}
			const terminal = { type: "response.event", delegation_id: delegationId, event: {
				type: ["response.completed", "response.incomplete", "response.failed", "response.cancelled"][random(4)],
				response: { id, model: "gpt-5.6-luna", service_tier: tier, output: [], usage: {
					input_tokens: input, output_tokens: output, total_tokens: input + output,
					input_tokens_details: { cached_tokens: cached, cache_write_tokens: written }, output_tokens_details: { reasoning_tokens: reasoning },
				} },
			} };
			// Exercise tool completion both before and after the response terminal.
			if (random(2)) events.unshift(terminal); else events.push(terminal);
			events.push(structuredClone(terminal)); groups.push(events);
		}
		const close = { type: "session.closed", usage: { seconds } };
		if (seed % 2) {
			ingest(close);
			expect(() => assertLiveFinalUsage(usage)).toThrow("response_authoritative_usage_pending");
		}
		while (groups.length) for (const event of groups.splice(random(groups.length), 1)[0]) ingest(event);
		ingest(close); ingest(close);
		expect(() => assertLiveFinalUsage(usage)).not.toThrow();
		const bill = priceLiveUsage(usage, config);
		const voice = Number((BigInt(seconds) * 50_000_000n + 30n) / 60n);
		expect(bill.live_voice_nanos).toBe(voice);
		expect(bill.live_backend_nanos).toBe(backend);
		expect(bill.live_tool_nanos).toBe(searches * 10_000_000);
		expect(bill.pricing).toMatchObject({ total_nanos: voice + backend + searches * 10_000_000 });
		expect(usage.live_responses).toHaveLength(count);
		expect(usage.live_pending_responses).toEqual([]);
		expect(usage.live_tool_calls?.length ?? 0).toBe(searches);
	});

	it.each([0, 0.001, 0.5, 1, 59.999, 60, 60.001, 3599.999])("rounds duration %s seconds at nanodollar precision, not whole minutes", (seconds) => {
		const millis = BigInt(Math.round(seconds * 1000));
		const expected = Number((millis * 50_000_000n + 30_000n) / 60_000n);
		expect(priceLiveUsage({ live_seconds: seconds }, config).live_voice_nanos).toBe(expected);
	});
});
