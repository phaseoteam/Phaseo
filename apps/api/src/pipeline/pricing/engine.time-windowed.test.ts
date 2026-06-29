import { describe, expect, it } from "vitest";
import { computeBill, computeBillSummary } from "./engine";
import type { PriceCard } from "./types";

const makeDeepSeekCard = (): PriceCard => ({
    provider: "deepseek",
    model: "deepseek/deepseek-v4-pro",
    endpoint: "text.generate",
    effective_from: null,
    effective_to: null,
    currency: "USD",
    version: null,
    rules: [
        {
            id: "deepseek-v4-pro-input",
            pricing_plan: "standard",
            meter: "input_text_tokens",
            unit: "token",
            unit_size: 1_000_000,
            price_per_unit: "0.435",
            currency: "USD",
            match: [],
            priority: 100,
            billing_timestamp_basis: "request_start",
            time_windows: [
                {
                    label: "peak",
                    timezone: "UTC",
                    start_time: "01:00",
                    end_time: "04:00",
                    price_per_unit: "0.87",
                },
                {
                    label: "peak",
                    timezone: "UTC",
                    start_time: "06:00",
                    end_time: "10:00",
                    price_per_unit: "0.87",
                },
            ],
        },
        {
            id: "deepseek-v4-pro-output",
            pricing_plan: "standard",
            meter: "output_text_tokens",
            unit: "token",
            unit_size: 1_000_000,
            price_per_unit: "0.87",
            currency: "USD",
            match: [],
            priority: 100,
            billing_timestamp_basis: "request_start",
            time_windows: [
                {
                    label: "peak",
                    timezone: "UTC",
                    start_time: "01:00",
                    end_time: "04:00",
                    price_per_unit: "1.74",
                },
            ],
        },
    ],
});

describe("pricing engine time-windowed rules", () => {
    it("uses the regular rule price outside UTC peak windows", () => {
        const result = computeBillSummary(
            { input_text_tokens: 1_000_000, output_text_tokens: 1_000_000 },
            makeDeepSeekCard(),
            { request_started_at: "2026-07-20T05:30:00Z" },
            "standard",
        );

        expect(result.cost_usd_str).toBe("1.305000000");
        expect(result.lines).toEqual([
            expect.objectContaining({
                dimension: "input_text_tokens",
                unit_price_usd: "0.435000000",
                pricing_time_window: null,
                billing_timestamp_basis: "request_start",
            }),
            expect.objectContaining({
                dimension: "output_text_tokens",
                unit_price_usd: "0.870000000",
                pricing_time_window: null,
                billing_timestamp_basis: "request_start",
            }),
        ]);
    });

    it("uses the override price inside a UTC peak window and snapshots the window", () => {
        const result = computeBillSummary(
            { input_text_tokens: 1_000_000, output_text_tokens: 1_000_000 },
            makeDeepSeekCard(),
            { request_started_at: "2026-07-20T01:30:00Z" },
            "standard",
        );

        expect(result.cost_usd_str).toBe("2.610000000");
        expect(result.lines).toEqual([
            expect.objectContaining({
                dimension: "input_text_tokens",
                unit_price_usd: "0.870000000",
                pricing_time_window: {
                    label: "peak",
                    timezone: "UTC",
                    start_time: "01:00",
                    end_time: "04:00",
                },
            }),
            expect.objectContaining({
                dimension: "output_text_tokens",
                unit_price_usd: "1.740000000",
                pricing_time_window: {
                    label: "peak",
                    timezone: "UTC",
                    start_time: "01:00",
                    end_time: "04:00",
                },
            }),
        ]);
    });

    it("falls back to request start when the requested basis timestamp is missing", () => {
        const card = makeDeepSeekCard();
        card.rules[0] = {
            ...card.rules[0],
            billing_timestamp_basis: "provider_accept",
        };

        const result = computeBill(
            { input_text_tokens: 1_000_000 },
            card,
            { request_started_at: "2026-07-20T06:30:00Z" },
            "standard",
        );

        expect(result.pricing.total_usd_str).toBe("0.87");
        expect(result.pricing.lines[0]).toMatchObject({
            unit_price_usd: "0.870000000",
            billing_timestamp_basis: "provider_accept",
            pricing_time_window: {
                label: "peak",
                timezone: "UTC",
                start_time: "06:00",
                end_time: "10:00",
            },
        });
    });
});
