// Purpose: Billing for prompt-cache controls forwarded per provider.
// Why: A cache lifetime the gateway sends changes the provider's write price, so the
//      write must be billed on the meter for the lifetime that was sent.
// How: Client body -> pricing context -> computeBillSummary, with each provider's documented
//      usage shape and the route's price card.

import { describe, expect, it } from "vitest";
import { computeBillSummary } from "./engine";
import { deriveCachePricingContext } from "./cache-context";
import type { PriceCard, PriceRule } from "./types";

function rule(meter: string, price: string): PriceRule {
    return {
        pricing_plan: "standard", meter: meter as PriceRule["meter"], unit: "token", unit_size: 1_000_000,
        price_per_unit: price, currency: "USD", match: [], priority: 100,
    };
}

function card(provider: string, model: string, rules: PriceRule[]): PriceCard {
    return { provider, model, endpoint: "text.generate", effective_from: null, effective_to: null, currency: "USD", version: null, rules };
}

const nanosBy = (bill: ReturnType<typeof computeBillSummary>) =>
    Object.fromEntries(bill.lines.map((line) => [line.dimension, line.line_nanos]));

describe("Moonshot prompt_cache_options.ttl", () => {
    // Kimi K3 rates, https://platform.kimi.ai/docs/pricing/chat-k3: input $3, cache hit $0.30,
    // cache write 5 min $3, cache write 1 h $6, per 1M tokens.
    const kimiK3 = card("moonshotai", "moonshotai/kimi-k3", [
        rule("input_text_tokens", "3"), rule("cached_read_text_tokens", "0.3"),
        rule("cached_write_text_tokens_5m", "3"), rule("cached_write_text_tokens_1h", "6"),
        rule("output_text_tokens", "15"),
    ]);
    // Moonshot's Chat usage: "cached_tokens, cache_write_tokens and the uncached remainder are
    // mutually exclusive and sum to prompt_tokens" (Moonshot OpenAPI, ChatCompletionResponse.usage).
    const usage = {
        prompt_tokens: 10_000,
        completion_tokens: 500,
        total_tokens: 10_500,
        prompt_tokens_details: { cached_tokens: 1_000, cache_write_tokens: 8_000 },
    };
    const body = (ttl?: string) => ({
        model: "moonshotai/kimi-k3",
        messages: [{ role: "user", content: "Summarise the design doc." }],
        ...(ttl ? { prompt_cache_options: { ttl } } : {}),
    });

    it("bills writes made with a 1-hour ttl on the 1-hour meter", () => {
        const bill = computeBillSummary(usage, kimiK3, deriveCachePricingContext(body("1h")));
        expect(nanosBy(bill)).toEqual({
            input_text_tokens: 3_000_000,
            cached_read_text_tokens: 300_000,
            cached_write_text_tokens_1h: 48_000_000,
            output_text_tokens: 7_500_000,
        });
        expect(bill.cost_usd_str).toBe("0.058800000");
    });

    it("bills writes on the 5-minute meter when the request names 5m or no ttl", () => {
        for (const ttl of ["5m", undefined]) {
            const bill = computeBillSummary(usage, kimiK3, deriveCachePricingContext(body(ttl)));
            expect(nanosBy(bill)).toMatchObject({ cached_write_text_tokens_5m: 24_000_000 });
            expect(nanosBy(bill)).not.toHaveProperty("cached_write_text_tokens_1h");
            expect(bill.cost_usd_str).toBe("0.034800000");
        }
    });

    it("ignores the ttl on a card with no 1-hour write row, where it is not sent", () => {
        // Kimi K2.6: no write rows, so the 1-hour ttl is removed before sending (execute/cacheTtl.ts).
        const kimiK26 = card("moonshotai", "moonshotai/kimi-k2.6", [
            rule("input_text_tokens", "0.95"), rule("cached_read_text_tokens", "0.16"), rule("output_text_tokens", "4"),
        ]);
        const withTtl = computeBillSummary(usage, kimiK26, deriveCachePricingContext(body("1h")));
        const without = computeBillSummary(usage, kimiK26, deriveCachePricingContext(body()));
        expect(withTtl.cost_usd_str).toBe(without.cost_usd_str);
        expect(nanosBy(withTtl)).toMatchObject({ cached_write_text_tokens: 7_600_000 });
    });

    it("leaves other providers' cards alone (Claude reports its own TTL split)", () => {
        const claude = card("anthropic", "anthropic/claude-sonnet-5", [
            rule("input_text_tokens", "3"), rule("cached_write_text_tokens_5m", "3.75"),
            rule("cached_write_text_tokens_1h", "6"), rule("output_text_tokens", "15"),
        ]);
        const bill = computeBillSummary(
            { input_tokens: 1_000, output_tokens: 10, cache_creation_input_tokens: 8_000 },
            claude,
            deriveCachePricingContext(body("1h")),
        );
        expect(nanosBy(bill)).toMatchObject({ cached_write_text_tokens_5m: 30_000_000 });
    });
});

describe("Inference.net Claude cache writes", () => {
    // claude-opus-5 on Inference.net: input $5, cache read $0.50, output $25; the page data's
    // 5-minute write price is $6.25 (1.25x input). The route has no write row.
    const opus = card("inference-net", "anthropic/claude-opus-5", [
        rule("input_text_tokens", "5"), rule("cached_read_text_tokens", "0.5"), rule("output_text_tokens", "25"),
    ]);
    const usage = {
        prompt_tokens: 10_000,
        completion_tokens: 500,
        prompt_tokens_details: { cached_tokens: 1_000, cache_write_tokens: 8_000 },
    };

    it("bills writes at the 5-minute rate, also when the client asked for 1h (the ttl is not sent)", () => {
        for (const cacheControl of [{ type: "ephemeral" }, { type: "ephemeral", ttl: "1h" }]) {
            const bill = computeBillSummary(usage, opus, deriveCachePricingContext({ cache_control: cacheControl }));
            expect(nanosBy(bill)).toEqual({
                input_text_tokens: 5_000_000,
                cached_read_text_tokens: 500_000,
                cached_write_text_tokens: 50_000_000,
                output_text_tokens: 12_500_000,
            });
        }
    });
});
