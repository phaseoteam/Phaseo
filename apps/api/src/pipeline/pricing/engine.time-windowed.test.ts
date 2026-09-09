import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeBill, computeBillSummary } from "./engine";
import type { PriceCard, PriceRule } from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../..");
const deepSeekV4ProPricingPath = path.join(
    repoRoot,
    "packages/data/catalog/src/data/pricing/deepseek/deepseek-deepseek-v4-pro-0813/text.generate/pricing.json",
);
const deepSeekV4FlashPricingPath = path.join(
    repoRoot,
    "packages/data/catalog/src/data/pricing/deepseek/deepseek-deepseek-v4-flash-0731/text.generate/pricing.json",
);
const deepSeekV4FlashVisionPricingPath = path.join(
    repoRoot,
    "packages/data/catalog/src/data/pricing/deepseek/deepseek-deepseek-v4-flash-vision-exp/text.generate/pricing.json",
);
const deepSeekV41FlashPricingPath = path.join(
    repoRoot,
    "packages/data/catalog/src/data/pricing/deepseek/deepseek-deepseek-v4.1-flash/text.generate/pricing.json",
);

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

function loadActiveCatalogPriceCard(pricingPath: string, nowIso = "2026-07-01T00:00:00.000Z"): PriceCard {
    const raw = JSON.parse(fs.readFileSync(pricingPath, "utf8"));
    const nowMs = Date.parse(nowIso);
    const rules = raw.rules
        .filter((rule: Record<string, unknown>) => {
            const effectiveFrom = typeof rule.effective_from === "string" ? rule.effective_from : null;
            const effectiveTo = typeof rule.effective_to === "string" ? rule.effective_to : null;
            return (!effectiveFrom || Date.parse(effectiveFrom) <= nowMs)
                && (!effectiveTo || Date.parse(effectiveTo) > nowMs);
        })
        .map((rule: Record<string, unknown>): PriceRule => ({
            id: `${String(raw.api_provider_id)}:${String(raw.api_model_id)}:${String(rule.pricing_plan)}:${String(rule.meter)}`,
            pricing_plan: String(rule.pricing_plan),
            meter: rule.meter as PriceRule["meter"],
            unit: String(rule.unit),
            unit_size: Number(rule.unit_size),
            price_per_unit: String(rule.price_per_unit),
            currency: String(rule.currency),
            match: Array.isArray(rule.match) ? rule.match as PriceRule["match"] : [],
            priority: Number(rule.priority ?? 0),
            billing_timestamp_basis: rule.billing_timestamp_basis as PriceRule["billing_timestamp_basis"],
            time_windows: Array.isArray(rule.time_windows)
                ? rule.time_windows as PriceRule["time_windows"]
                : undefined,
        }));

    return {
        provider: String(raw.api_provider_id),
        model: String(raw.api_model_id),
        endpoint: String(raw.capability_id),
        effective_from: raw.effective_from ?? null,
        effective_to: raw.effective_to ?? null,
        currency: "USD",
        version: null,
        rules,
    };
}

const deepSeekV4CatalogCases = [
    {
        label: "DeepSeek V4 Pro",
        pricingPath: deepSeekV4ProPricingPath,
        baseTotal: "1.308625000",
        offPeakTotal: "2.662000000",
        peakTotal: "5.324000000",
        peakPricesByMeter: {
            input_text_tokens: "1.32",
            cached_read_text_tokens: "0.044",
            output_text_tokens: "3.96",
        },
    },
    {
        label: "DeepSeek V4 Flash",
        pricingPath: deepSeekV4FlashPricingPath,
        baseTotal: "0.422800000",
        offPeakTotal: "0.887000000",
        peakTotal: "1.774000000",
        peakPricesByMeter: {
            input_text_tokens: "0.44",
            cached_read_text_tokens: "0.014",
            output_text_tokens: "1.32",
        },
    },
];

const deepSeekWeekendCatalogCases = [
    ...deepSeekV4CatalogCases.map(({ label, pricingPath, offPeakTotal, peakTotal }) => ({
        label,
        pricingPath,
        offPeakTotal,
        peakTotal,
    })),
    {
        label: "DeepSeek V4 Flash Vision Exp",
        pricingPath: deepSeekV4FlashVisionPricingPath,
        offPeakTotal: "0.887000000",
        peakTotal: "1.774000000",
    },
];

const deepSeekV41CatalogCases = [
    {
        label: "DeepSeek V4.1 Flash",
        pricingPath: deepSeekV41FlashPricingPath,
    },
];

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

    it("applies weekday-constrained windows only on matching UTC weekdays", () => {
        const card = makeDeepSeekCard();
        card.rules = card.rules.map((rule) => ({
            ...rule,
            time_windows: rule.time_windows?.map((window) => ({
                ...window,
                days_of_week: ["mon", "tue", "wed", "thu", "fri"],
            })),
        }));

        const sunday = computeBillSummary(
            { input_text_tokens: 1_000_000 },
            card,
            { request_started_at: "2026-08-23T06:30:00Z" },
            "standard",
        );
        const monday = computeBillSummary(
            { input_text_tokens: 1_000_000 },
            card,
            { request_started_at: "2026-08-24T06:30:00Z" },
            "standard",
        );

        expect(sunday.lines[0]).toMatchObject({
            unit_price_usd: "0.435000000",
            pricing_time_window: null,
        });
        expect(monday.lines[0]).toMatchObject({
            unit_price_usd: "0.870000000",
            pricing_time_window: expect.objectContaining({
                days_of_week: ["mon", "tue", "wed", "thu", "fri"],
            }),
        });
    });

    it("uses the upstream send time for provider-accept pricing windows", () => {
        const card = makeDeepSeekCard();
        card.rules[0] = {
            ...card.rules[0],
            billing_timestamp_basis: "provider_accept",
        };

        const result = computeBill(
            { input_text_tokens: 1_000_000 },
            card,
            {
                request_started_at: "2026-07-20T05:30:00Z",
                upstreamStartMs: Date.parse("2026-07-20T06:30:00Z"),
                completed_at: "2026-07-20T11:30:00Z",
            },
            "standard",
        );

        expect(result.pricing.total_usd_str).toBe("0.87");
        expect(result.pricing.lines[0]).toMatchObject({
            unit_price_usd: "0.870000000",
            billing_timestamp_basis: "provider_accept",
            billing_timestamp_basis_configured: "provider_accept",
            billing_timestamp_ms: Date.parse("2026-07-20T06:30:00Z"),
            billing_timestamp_iso: "2026-07-20T06:30:00.000Z",
            pricing_time_window: {
                label: "peak",
                timezone: "UTC",
                start_time: "06:00",
                end_time: "10:00",
            },
        });
    });

    it("does not apply a time-window override when the configured timestamp is missing", () => {
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

        expect(result.pricing.total_usd_str).toBe("0.435");
        expect(result.pricing.lines[0]).toMatchObject({
            unit_price_usd: "0.435000000",
            billing_timestamp_basis: "provider_accept",
            billing_timestamp_basis_configured: "provider_accept",
            billing_timestamp_ms: null,
            billing_timestamp_iso: null,
            pricing_time_window: null,
        });
    });

    it("matches wrap-around UTC windows", () => {
        const card = makeDeepSeekCard();
        card.rules[0] = {
            ...card.rules[0],
            time_windows: [
                {
                    label: "overnight",
                    timezone: "UTC",
                    start_time: "22:00",
                    end_time: "02:00",
                    price_per_unit: "0.99",
                },
            ],
        };

        const result = computeBillSummary(
            { input_text_tokens: 1_000_000 },
            card,
            { request_started_at: "2026-07-20T23:30:00Z" },
            "standard",
        );

        expect(result.lines[0]).toMatchObject({
            unit_price_usd: "0.990000000",
            pricing_time_window: {
                label: "overnight",
                timezone: "UTC",
                start_time: "22:00",
                end_time: "02:00",
            },
        });
    });

    it("treats end_time as an exclusive UTC boundary", () => {
        const result = computeBillSummary(
            { input_text_tokens: 1_000_000 },
            makeDeepSeekCard(),
            { request_started_at: "2026-07-20T04:00:00Z" },
            "standard",
        );

        expect(result.lines[0]).toMatchObject({
            unit_price_usd: "0.435000000",
            pricing_time_window: null,
        });
    });

    it("falls back to the base price when a matching window has no override price", () => {
        const card = makeDeepSeekCard();
        card.rules[0] = {
            ...card.rules[0],
            time_windows: [
                {
                    label: "metadata-only",
                    timezone: "UTC",
                    start_time: "01:00",
                    end_time: "04:00",
                    price_per_unit: null,
                },
            ],
        };

        const result = computeBillSummary(
            { input_text_tokens: 1_000_000 },
            card,
            { request_started_at: "2026-07-20T01:30:00Z" },
            "standard",
        );

        expect(result.lines[0]).toMatchObject({
            unit_price_usd: "0.435000000",
            pricing_time_window: null,
        });
    });

    it("uses the highest priority matching window when windows overlap", () => {
        const card = makeDeepSeekCard();
        card.rules[0] = {
            ...card.rules[0],
            time_windows: [
                {
                    label: "broad",
                    timezone: "UTC",
                    start_time: "01:00",
                    end_time: "04:00",
                    price_per_unit: "0.50",
                    priority: 1,
                },
                {
                    label: "surge",
                    timezone: "UTC",
                    start_time: "02:00",
                    end_time: "03:00",
                    price_per_unit: "1.25",
                    priority: 10,
                },
            ],
        };

        const result = computeBillSummary(
            { input_text_tokens: 1_000_000 },
            card,
            { request_started_at: "2026-07-20T02:30:00Z" },
            "standard",
        );

        expect(result.lines[0]).toMatchObject({
            unit_price_usd: "1.250000000",
            pricing_time_window: {
                label: "surge",
                timezone: "UTC",
                start_time: "02:00",
                end_time: "03:00",
            },
        });
    });
});

describe("DeepSeek V4 catalog time-period pricing", () => {
	it("bills DeepSeek Vision image tokens once through aggregate input usage", () => {
		const card = loadActiveCatalogPriceCard(deepSeekV4FlashVisionPricingPath, "2026-08-21T00:00:00.000Z");

		const result = computeBillSummary(
			// DeepSeek reports image-derived tokens within the aggregate input total.
			{ input_text_tokens: 512, input_image_tokens: 384 },
			card,
			{ request_started_at: "2026-08-21T05:00:00Z", upstreamStartMs: Date.parse("2026-08-21T05:00:00Z") },
			"standard",
		);

		expect(result.lines).toEqual([
			expect.objectContaining({ dimension: "input_text_tokens", quantity: 512 }),
		]);
		expect(result.cost_usd_str).toBe("0.000112640");
	});

    it.each(deepSeekV4CatalogCases)(
        "keeps current prices active for $label before the scheduled cutover",
        ({ pricingPath, baseTotal }) => {
            const card = loadActiveCatalogPriceCard(pricingPath, "2026-08-16T15:59:59.999Z");

            expect(card.rules).toHaveLength(3);
            expect(card.rules.every((rule) => !rule.time_windows?.length)).toBe(true);
            expect(card.rules.every((rule) => rule.billing_timestamp_basis === "provider_accept")).toBe(true);

            const result = computeBillSummary(
                {
                    input_text_tokens: 1_000_000,
                    cached_read_text_tokens: 1_000_000,
                    output_text_tokens: 1_000_000,
                },
                card,
                {
                    request_started_at: "2026-08-16T15:59:00Z",
                    upstreamStartMs: Date.parse("2026-08-16T15:59:59.999Z"),
                    completed_at: "2026-08-16T16:01:00Z",
                },
                "standard",
            );

            expect(result.cost_usd_str).toBe(baseTotal);
            expect(result.lines.every((line) => line.pricing_time_window === null)).toBe(true);
        },
    );

    it.each(deepSeekV4CatalogCases)(
        "bills $label scheduled off-peak and peak prices after the cutover",
        ({ pricingPath, peakPricesByMeter, offPeakTotal, peakTotal }) => {
            const card = loadActiveCatalogPriceCard(pricingPath, "2026-08-16T16:00:00.000Z");

            expect(card.rules).toHaveLength(3);
            expect(card.rules.every((rule) => rule.time_windows?.length === 2)).toBe(true);
            expect(card.rules.every((rule) => rule.billing_timestamp_basis === "provider_accept")).toBe(true);

            const offPeak = computeBillSummary(
                {
                    input_text_tokens: 1_000_000,
                    cached_read_text_tokens: 1_000_000,
                    output_text_tokens: 1_000_000,
                },
                card,
                {
                    request_started_at: "2026-08-17T05:00:00Z",
                    upstreamStartMs: Date.parse("2026-08-17T05:30:00Z"),
                    completed_at: "2026-08-17T06:30:00Z",
                },
                "standard",
            );
            const peak = computeBillSummary(
                {
                    input_text_tokens: 1_000_000,
                    cached_read_text_tokens: 1_000_000,
                    output_text_tokens: 1_000_000,
                },
                card,
                {
                    request_started_at: "2026-08-17T05:30:00Z",
                    upstreamStartMs: Date.parse("2026-08-17T06:30:00Z"),
                    completed_at: "2026-08-17T11:30:00Z",
                },
                "standard",
            );

            expect(offPeak.cost_usd_str).toBe(offPeakTotal);
            expect(offPeak.lines.every((line) => line.pricing_time_window === null)).toBe(true);
            expect(peak.cost_usd_str).toBe(peakTotal);
            expect(peak.lines).toEqual([
                expect.objectContaining({
                    dimension: "input_text_tokens",
                    unit_price_usd: `${Number(peakPricesByMeter.input_text_tokens).toFixed(9)}`,
                    billing_timestamp_basis: "provider_accept",
                    billing_timestamp_basis_configured: "provider_accept",
                    pricing_time_window: {
                        label: "peak",
                        timezone: "UTC",
                        start_time: "06:00",
                        end_time: "10:00",
                    },
                }),
                expect.objectContaining({
                    dimension: "cached_read_text_tokens",
                    unit_price_usd: `${Number(peakPricesByMeter.cached_read_text_tokens).toFixed(9)}`,
                    billing_timestamp_basis: "provider_accept",
                    billing_timestamp_basis_configured: "provider_accept",
                    pricing_time_window: {
                        label: "peak",
                        timezone: "UTC",
                        start_time: "06:00",
                        end_time: "10:00",
                    },
                }),
                expect.objectContaining({
                    dimension: "output_text_tokens",
                    unit_price_usd: `${Number(peakPricesByMeter.output_text_tokens).toFixed(9)}`,
                    billing_timestamp_basis: "provider_accept",
                    billing_timestamp_basis_configured: "provider_accept",
                    pricing_time_window: {
                        label: "peak",
                        timezone: "UTC",
                        start_time: "06:00",
                        end_time: "10:00",
                    },
                }),
            ]);
        },
    );

    it.each(deepSeekWeekendCatalogCases)(
        "keeps $label off-peak all weekend after the weekend-pricing cutover",
        ({ pricingPath, offPeakTotal, peakTotal }) => {
            const card = loadActiveCatalogPriceCard(pricingPath, "2026-08-22T16:00:00.000Z");
            const usage = {
                input_text_tokens: 1_000_000,
                cached_read_text_tokens: 1_000_000,
                output_text_tokens: 1_000_000,
            };
            const sunday = computeBillSummary(
                usage,
                card,
                { upstreamStartMs: Date.parse("2026-08-23T06:30:00Z") },
                "standard",
            );
            const saturday = computeBillSummary(
                usage,
                card,
                { upstreamStartMs: Date.parse("2026-08-29T06:30:00Z") },
                "standard",
            );
            const monday = computeBillSummary(
                usage,
                card,
                { upstreamStartMs: Date.parse("2026-08-24T06:30:00Z") },
                "standard",
            );

            expect(card.rules).toHaveLength(3);
            expect(card.rules.every((rule) => rule.time_windows?.every((window) =>
                window.days_of_week?.join(",") === "mon,tue,wed,thu,fri"
            ))).toBe(true);
            expect(sunday.cost_usd_str).toBe(offPeakTotal);
            expect(sunday.lines.every((line) => line.pricing_time_window === null)).toBe(true);
            expect(saturday.cost_usd_str).toBe(offPeakTotal);
            expect(saturday.lines.every((line) => line.pricing_time_window === null)).toBe(true);
            expect(monday.cost_usd_str).toBe(peakTotal);
            expect(monday.lines.every((line) => line.pricing_time_window !== null)).toBe(true);
        },
    );

    it.each(deepSeekV41CatalogCases)(
        "applies the September 10 Flash-series price schedule for $label",
        ({ pricingPath }) => {
            const card = loadActiveCatalogPriceCard(pricingPath, "2026-09-10T04:00:00.000Z");
            const usage = {
                input_text_tokens: 1_000_000,
                cached_read_text_tokens: 1_000_000,
                output_text_tokens: 1_000_000,
            };

            expect(card.rules).toHaveLength(3);
            expect(card.rules.map((rule) => rule.price_per_unit)).toEqual(["0.15", "0.003", "0.6"]);
            expect(card.rules.every((rule) => rule.time_windows?.length === 2)).toBe(true);

            const offPeak = computeBillSummary(
                usage,
                card,
                { upstreamStartMs: Date.parse("2026-09-10T05:00:00Z") },
                "standard",
            );
            const peak = computeBillSummary(
                usage,
                card,
                { upstreamStartMs: Date.parse("2026-09-10T06:30:00Z") },
                "standard",
            );

            expect(offPeak.cost_usd_str).toBe("0.753000000");
            expect(offPeak.lines.every((line) => line.pricing_time_window === null)).toBe(true);
            expect(peak.cost_usd_str).toBe("1.506000000");
            expect(peak.lines).toEqual([
                expect.objectContaining({
                    dimension: "input_text_tokens",
                    unit_price_usd: "0.300000000",
                    pricing_time_window: expect.objectContaining({ label: "peak", timezone: "UTC" }),
                }),
                expect.objectContaining({
                    dimension: "cached_read_text_tokens",
                    unit_price_usd: "0.006000000",
                    pricing_time_window: expect.objectContaining({ label: "peak", timezone: "UTC" }),
                }),
                expect.objectContaining({
                    dimension: "output_text_tokens",
                    unit_price_usd: "1.200000000",
                    pricing_time_window: expect.objectContaining({ label: "peak", timezone: "UTC" }),
                }),
            ]);
        },
    );
});
