// Claude 5-minute and 1-hour cache writes on every price-card shape the catalogue holds.
// Documented prices: 5-minute writes 1.25x input, 1-hour writes 2x input
// (https://platform.claude.com/docs/en/build-with-claude/prompt-caching#pricing).
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeBill, computeBillSummary } from "./engine";
import { reportedCacheTokens } from "@core/cache-usage";
import type { PriceCard } from "./types";

function card(provider: string, model: string, prices: Record<string, string>): PriceCard {
    return {
        provider, model, endpoint: "text.generate",
        effective_from: null, effective_to: null, currency: "USD", version: null,
        rules: Object.entries(prices).map(([meter, price]) => ({
            pricing_plan: "standard", meter: meter as any, unit: "token", unit_size: 1_000_000,
            price_per_unit: price, currency: "USD", match: [], priority: 100,
        })),
    };
}

const nanosBy = (result: ReturnType<typeof computeBillSummary>) =>
    Object.fromEntries(result.lines.map((line) => [line.dimension, line.line_nanos]));

// Anthropic Messages usage: 1,000 5-minute and 1,000 1-hour writes, reported beside input.
const splitUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 2_000,
    cache_creation: { ephemeral_5m_input_tokens: 1_000, ephemeral_1h_input_tokens: 1_000 },
};

afterEach(() => vi.restoreAllMocks());

describe("one TTL-agnostic write row (Claude Sonnet 4.6 on Azure: $3 input, $3.75 write)", () => {
    const azure = () => card("azure", "anthropic/claude-sonnet-4.6", {
        input_text_tokens: "3", output_text_tokens: "15", cached_read_text_tokens: "0.3", cached_write_text_tokens: "3.75",
    });

    it("bills 1-hour writes at the documented 2x input, not the 5-minute row", () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const result = computeBillSummary(splitUsage, azure());
        // 1,000 x $3.75 + 1,000 x $6 per 1M tokens.
        expect(nanosBy(result)).toEqual({ cached_write_text_tokens: 3_750_000, cached_write_text_tokens_1h: 6_000_000 });
        expect(result.cache_pricing_fallback).toEqual([
            expect.objectContaining({ meter: "cached_write_text_tokens_1h", quantity: 1_000, multiplier: 2 }),
        ]);
    });

    it("bills a request that only wrote 1-hour entries at the 1-hour rate", () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const result = computeBillSummary({
            input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000,
            cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1_000 },
        }, azure());
        expect(nanosBy(result)).toEqual({ cached_write_text_tokens_1h: 6_000_000 });
    });

    it("keeps 5-minute-only writes on the write row with no fallback", () => {
        const result = computeBillSummary({
            input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000,
            cache_creation: { ephemeral_5m_input_tokens: 1_000, ephemeral_1h_input_tokens: 0 },
        }, azure());
        expect(nanosBy(result)).toEqual({ cached_write_text_tokens: 3_750_000 });
        expect(result.cache_pricing_fallback).toBeUndefined();
    });

    it("reports every write once to observability", () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const billed = computeBill(splitUsage, azure());
        expect(reportedCacheTokens(billed)).toMatchObject({ writeTokens: 2_000, write1hTokens: 1_000 });
    });

    it("leaves providers without a documented 1-hour rate on their write row", () => {
        const other = card("venice", "zai-org/glm-5", { input_text_tokens: "1", output_text_tokens: "3", cached_write_text_tokens: "1.25" });
        expect(nanosBy(computeBillSummary(splitUsage, other))).toEqual({ cached_write_text_tokens: 2_500_000 });
    });
});

describe("write totals above the TTL split", () => {
    // A streamed message_delta reports the cumulative cache_creation_input_tokens; the
    // cache_creation split came with message_start.
    const streamedUsage = {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 3_000,
        cache_creation: { ephemeral_5m_input_tokens: 1_000, ephemeral_1h_input_tokens: 1_000 },
    };

    it("bills writes outside the split at the 5-minute rate on split meters (Claude Sonnet 4.6 on Anthropic)", () => {
        const anthropic = card("anthropic", "anthropic/claude-sonnet-4.6", {
            input_text_tokens: "3", output_text_tokens: "15",
            cached_write_text_tokens_5m: "3.75", cached_write_text_tokens_1h: "6",
        });
        // 2,000 x $3.75 + 1,000 x $6 per 1M tokens; main dropped the 1,000 unsplit writes.
        expect(nanosBy(computeBillSummary(streamedUsage, anthropic))).toEqual({
            cached_write_text_tokens_5m: 7_500_000,
            cached_write_text_tokens_1h: 6_000_000,
        });
    });

    it("bills them at the 1-hour rate when the request asked for 1-hour caching", () => {
        const anthropic = card("anthropic", "anthropic/claude-sonnet-4.6", {
            input_text_tokens: "3", output_text_tokens: "15",
            cached_write_text_tokens_5m: "3.75", cached_write_text_tokens_1h: "6",
        });
        expect(nanosBy(computeBillSummary(streamedUsage, anthropic, { cache_ttl: "1h" }))).toEqual({
            cached_write_text_tokens_5m: 3_750_000,
            cached_write_text_tokens_1h: 12_000_000,
        });
    });
});
