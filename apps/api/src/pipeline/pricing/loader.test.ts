import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetPricingLoaderCachesForTests, loadPriceCard } from "./loader";

const runtime = vi.hoisted(() => ({ client: null as ReturnType<typeof createClient> | null }));
vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => runtime.client }));
const requests: URL[] = [];
const meter = (id: string, order: number, price: number) => ({
    sku_meter_id: id, sku_id: "sku-1", meter_key: id, unit: "token", unit_quantity: 1_000_000,
    price_nanos: price, meter_order: order, metadata: {}, updated_at: "2026-09-01T00:00:00Z",
});
const sku = () => ({
    sku_id: "sku-1", provider_model_id: "route-1", service_tier_slug: "standard", operation: "text.generate",
    currency: "USD", effective_from: "2026-08-01T00:00:00Z", effective_to: "2026-09-06T00:00:00Z",
    metadata: { included_quantity: 2, time_windows: [{ price_per_unit: 0 }] }, updated_at: "2026-08-01T00:00:00Z",
    meters: [meter("output_text_tokens", 2, 200), meter("input_text_tokens", 1, 100)],
});
let rows: ReturnType<typeof sku>[];
let respond: () => Promise<Response>;

describe("joined price-card loader", () => {
    beforeEach(() => {
        __resetPricingLoaderCachesForTests();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-05T00:00:00Z"));
        rows = [sku()];
        requests.length = 0;
        respond = async () => Response.json(rows);
        runtime.client = createClient("https://pricing.example.com", "test-key", {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { fetch: async (input) => { requests.push(new URL(String(input))); return respond(); } },
        });
    });
    afterEach(() => vi.useRealTimers());

    it("loads and orders all pricing meters with one filtered HTTP request", async () => {
        const card = await loadPriceCard("poolside", "poolside/laguna-s-2.1:free", "text.generate");
        expect(requests).toHaveLength(1);
        const params = requests[0].searchParams;
        expect(requests[0].pathname).toBe("/rest/v1/v2_pricing_skus");
        expect(params.get("select")).toContain("route:v2_model_provider_routes!inner");
        expect(params.get("route.provider_slug")).toBe("eq.poolside");
        expect(params.get("route.status")).toBe("in.(active,degraded)");
        expect(params.get("route.routing_enabled")).toBe("eq.true");
        expect(params.get("operation")).toBe("eq.text.generate");
        expect(params.get("status")).toBe("eq.active");
        expect(params.get("currency")).toBe("eq.USD");
        expect(params.get("meters.billable")).toBe("eq.true");
        expect(params.get("effective_from")).toBe("lte.2026-09-05T00:00:00.000Z");
        expect(params.get("or")).toBe("(effective_to.is.null,effective_to.gt.2026-09-05T00:00:00.000Z)");
        expect(card?.rules.map((rule) => rule.id)).toEqual(["input_text_tokens", "output_text_tokens"]);
        expect(card?.rules[0]).toMatchObject({ unit_size: 1_000_000, price_per_unit: "1e-7", included_quantity: 2, time_windows: [{ price_per_unit: "0" }] });
        expect(card?.version).toBe("2026-09-01T00:00:00.000Z");
    });

    it("uses only the exact executed provider slug when one is supplied", async () => {
        await loadPriceCard("minimax", "canonical", "text.generate", "speech-hd");
        expect(requests[0].searchParams.get("route.provider_model_slug")).toBe("eq.speech-hd");
        expect(requests[0].searchParams.has("route.or")).toBe(false);
    });

    it("quotes reserved characters in canonical/provider-slug alternatives", async () => {
        const model = 'model,or(foo)."quoted"\\bar';
        await loadPriceCard("poolside", model, "text.generate");
        expect(requests[0].searchParams.get("route.or")).toBe(`(model_slug.eq.${JSON.stringify(model)},provider_model_slug.eq.${JSON.stringify(model)})`);
    });

    it("retains window/version metadata from SKUs without billable meters", async () => {
        rows.push({ ...sku(), sku_id: "empty", meters: [], effective_to: "2026-09-05T00:00:01Z", updated_at: "2026-09-04T00:00:00Z" });
        const card = await loadPriceCard("poolside", "free", "text.generate");
        expect(card?.effective_to).toBe("2026-09-05T00:00:01.000Z");
        expect(card?.version).toBe("2026-09-04T00:00:00.000Z");
        vi.advanceTimersByTime(1_001);
        await loadPriceCard("poolside", "free", "text.generate");
        expect(requests).toHaveLength(2);
    });

    it("shares simultaneous cold loads and caches the result", async () => {
        const cards = await Promise.all(Array.from({ length: 20 }, () => loadPriceCard("poolside", "free", "text.generate")));
        expect(requests).toHaveLength(1);
        expect(cards.every((card) => card === cards[0])).toBe(true);
        await loadPriceCard("poolside", "free", "text.generate");
        expect(requests).toHaveLength(1);
    });

    it("negative-caches missing prices and refreshes after the negative TTL", async () => {
        rows = [];
        expect(await loadPriceCard("poolside", "free", "text.generate")).toBeNull();
        rows = [sku()];
        expect(await loadPriceCard("poolside", "free", "text.generate")).toBeNull();
        vi.advanceTimersByTime(15_001);
        expect(await loadPriceCard("poolside", "free", "text.generate")).not.toBeNull();
        expect(requests).toHaveLength(2);
    });

    it("fails closed on query errors without caching them as missing prices", async () => {
        respond = async () => Response.json({ message: "invalid relationship" }, { status: 400 });
        expect(await loadPriceCard("poolside", "free", "text.generate")).toBeNull();
        respond = async () => Response.json(rows);
        expect(await loadPriceCard("poolside", "free", "text.generate")).not.toBeNull();
        expect(requests).toHaveLength(2);
    });
});
