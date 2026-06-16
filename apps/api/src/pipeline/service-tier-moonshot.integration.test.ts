import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PriceCard } from "./pricing/types";
import { applyServiceTierRouting } from "./before/serviceTierRouting";
import { calculatePricing } from "./after/pricing";

const queryState = vi.hoisted(() => ({
    providerRows: [] as any[],
    capabilityRows: [] as any[],
    providerFilters: {} as Record<string, unknown>,
}));

vi.mock("@/runtime/env", () => ({
    getSupabaseAdmin: () => ({
        from: (table: string) => {
            if (table === "data_api_provider_models") {
                return {
                    select: () => {
                        const builder: any = {
                            eq: (_column: string, _value: unknown) => builder,
                        };
                        builder.eq = (column: string, value: unknown) => {
                            queryState.providerFilters[column] = value;
                            if (column === "is_active_gateway") {
                                const rows = queryState.providerRows.filter((row) =>
                                    Object.entries(queryState.providerFilters).every(
                                        ([filterColumn, filterValue]) =>
                                            row[filterColumn as keyof typeof row] === filterValue,
                                    ),
                                );
                                return Promise.resolve({
                                    data: rows,
                                    error: null,
                                });
                            }
                            return builder;
                        };
                        return builder;
                    },
                };
            }

            if (table === "data_api_provider_model_capabilities") {
                return {
                    select: () => {
                        const builder: any = {
                            eq: (_column: string, _value: unknown) => builder,
                            in: (_column: string, _value: unknown) => builder,
                        };
                        builder.in = (column: string, _value: unknown) => {
                            if (column === "provider_api_model_id") {
                                return Promise.resolve({
                                    data: queryState.capabilityRows,
                                    error: null,
                                });
                            }
                            return builder;
                        };
                        return builder;
                    },
                };
            }

            throw new Error(`Unexpected table: ${table}`);
        },
    }),
}));

function makeMoonshotPriorityCard(): PriceCard {
    return {
        provider: "moonshotai",
        model: "moonshotai/kimi-k2.7-code",
        endpoint: "text.generate",
        effective_from: null,
        effective_to: null,
        currency: "USD",
        version: null,
        rules: [
            {
                pricing_plan: "standard",
                meter: "input_text_tokens",
                unit: "token",
                unit_size: 1_000_000,
                price_per_unit: "0.95",
                currency: "USD",
                match: [],
                priority: 100,
            },
            {
                pricing_plan: "standard",
                meter: "cached_read_text_tokens",
                unit: "token",
                unit_size: 1_000_000,
                price_per_unit: "0.19",
                currency: "USD",
                match: [],
                priority: 100,
            },
            {
                pricing_plan: "standard",
                meter: "output_text_tokens",
                unit: "token",
                unit_size: 1_000_000,
                price_per_unit: "4",
                currency: "USD",
                match: [],
                priority: 100,
            },
            {
                pricing_plan: "priority",
                meter: "input_text_tokens",
                unit: "token",
                unit_size: 1_000_000,
                price_per_unit: "1.9",
                currency: "USD",
                match: [],
                priority: 100,
            },
            {
                pricing_plan: "priority",
                meter: "cached_read_text_tokens",
                unit: "token",
                unit_size: 1_000_000,
                price_per_unit: "0.38",
                currency: "USD",
                match: [],
                priority: 100,
            },
            {
                pricing_plan: "priority",
                meter: "output_text_tokens",
                unit: "token",
                unit_size: 1_000_000,
                price_per_unit: "8",
                currency: "USD",
                match: [],
                priority: 100,
            },
        ],
    };
}

describe("Moonshot priority service tier validation", () => {
    beforeEach(() => {
        queryState.providerRows = [];
        queryState.capabilityRows = [];
        queryState.providerFilters = {};
    });

    it("routes K2.7 Code priority traffic to HighSpeed and bills with HighSpeed rates", async () => {
        queryState.providerRows = [
            {
                provider_id: "moonshotai",
                api_model_id: "moonshotai/kimi-k2.7-code-highspeed",
                provider_api_model_id: "moonshot-highspeed-pam",
                provider_model_slug: "kimi-k2.7-code-highspeed",
                is_active_gateway: false,
                effective_from: "2026-06-12T00:00:00Z",
                effective_to: null,
            },
        ];
        queryState.capabilityRows = [
            {
                provider_api_model_id: "moonshot-highspeed-pam",
                params: { thinking: true },
                max_input_tokens: 262_144,
                max_output_tokens: 65_536,
                status: "active",
                updated_at: "2026-06-12T00:00:00Z",
                created_at: "2026-06-12T00:00:00Z",
            },
        ];

        const routing = await applyServiceTierRouting({
            candidates: [
                {
                    providerId: "moonshotai",
                    apiModelId: "moonshotai/kimi-k2.7-code",
                    pricingKey: "moonshotai:moonshotai/kimi-k2.7-code",
                    providerModelSlug: "kimi-k2.7-code",
                    pricingCard: makeMoonshotPriorityCard(),
                    offerScope: null,
                    offerLabel: null,
                    capabilityParams: {},
                    maxInputTokens: null,
                    maxOutputTokens: null,
                } as any,
            ],
            body: { service_tier: "priority" },
            capability: "text.generate",
        });

        expect(routing.candidates).toHaveLength(1);
        expect(routing.candidates[0]).toMatchObject({
            apiModelId: "moonshotai/kimi-k2.7-code",
            pricingKey: "moonshotai:moonshotai/kimi-k2.7-code",
            providerModelSlug: "kimi-k2.7-code-highspeed",
        });

        const priced = calculatePricing(
            {
                input_text_tokens: 1_000_000,
                cached_read_text_tokens: 1_000_000,
                output_text_tokens: 1_000_000,
            },
            routing.candidates[0].pricingCard,
            { service_tier: "priority" },
        );

        expect(priced.totalNanos).toBe(10_280_000_000);
        expect(priced.pricedUsage?.pricing?.lines?.map((line: any) => line.unit_price_usd)).toEqual([
            "1.900000000",
            "0.380000000",
            "8.000000000",
        ]);
    });
});
