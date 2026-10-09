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
    it("isolates admin internal pricing from ordinary route lookups and cache entries", async () => {
        const privateCard = await loadPriceCard("example", "example/internal", "text.generate", "preview", true);
        expect(privateCard?.rules).toHaveLength(2);
        const privateParams = requests[0].searchParams;
        expect(privateParams.get("access_scope")).toBe("eq.internal");
        expect(privateParams.get("phaseo_status")).toBe("in.(testing,enabled)");
        expect(privateParams.has("routing_enabled")).toBe(false);
        expect(privateParams.get("provider_model_slug")).toBe("eq.preview");
        respond = async () => Response.json([]);
        expect(await loadPriceCard("example", "example/internal", "text.generate", "preview")).toBeNull();
        expect(requests).toHaveLength(2);
        expect(requests[1].searchParams.get("routing_enabled")).toBe("eq.true");
        expect(await loadPriceCard("example", "example/internal", "text.generate", "preview", true)).toBe(privateCard);
        expect(requests).toHaveLength(2);
    });
    beforeEach(() => {
        __resetPricingLoaderCachesForTests();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-05T00:00:00Z"));
        rows = [sku()];
        requests.length = 0;
        respond = async () => Response.json([{ provider_model_id: "route-1", skus: rows }]);
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
        // Rooted at the route so Postgres filters routes by index before
        // embedding SKUs and meters.
        expect(requests[0].pathname).toBe("/rest/v1/v2_model_provider_routes");
        expect(params.get("select")).toContain("skus:v2_pricing_skus(");
        expect(params.get("provider_slug")).toBe("eq.poolside");
        expect(params.get("status")).toBe("in.(active,degraded)");
        expect(params.get("routing_enabled")).toBe("eq.true");
        expect(params.get("skus.operation")).toBe("eq.text.generate");
        expect(params.get("skus.status")).toBe("eq.active");
        expect(params.get("skus.currency")).toBe("eq.USD");
        expect(params.get("skus.meters.billable")).toBe("eq.true");
        expect(params.get("skus.effective_from")).toBe("lte.2026-09-05T00:00:00.000Z");
        expect(params.get("skus.or")).toBe("(effective_to.is.null,effective_to.gt.2026-09-05T00:00:00.000Z)");
        expect(card?.rules.map((rule) => rule.id)).toEqual(["input_text_tokens", "output_text_tokens"]);
        expect(card?.rules[0]).toMatchObject({ unit_size: 1_000_000, price_per_unit: "1e-7", included_quantity: 2, time_windows: [{ price_per_unit: "0" }] });
        expect(card?.version).toBe("2026-09-01T00:00:00.000Z");
    });

    it("loads itself when another request's load never settles", async () => {
        // The first request's I/O is cancelled with that request and never settles.
        respond = () => new Promise<Response>(() => {});
        void loadPriceCard("poolside", "poolside/laguna-s-2.1:free", "text.generate");
        await vi.advanceTimersByTimeAsync(0);
        respond = async () => Response.json([{ provider_model_id: "route-1", skus: rows }]);
        const card = loadPriceCard("poolside", "poolside/laguna-s-2.1:free", "text.generate");
        await vi.advanceTimersByTimeAsync(1_500);
        expect((await card)?.rules.map((rule) => rule.id)).toEqual(["input_text_tokens", "output_text_tokens"]);
        expect(requests).toHaveLength(2);
    });

    it("does not let a slow superseded load overwrite its replacement", async () => {
        let finishSlow!: (response: Response) => void;
        respond = () => new Promise<Response>((resolve) => { finishSlow = resolve; });
        void loadPriceCard("poolside", "poolside/laguna-s-2.1:free", "text.generate");
        await vi.advanceTimersByTimeAsync(0);
        respond = async () => Response.json([{ provider_model_id: "route-1", skus: rows }]);
        const replacement = loadPriceCard("poolside", "poolside/laguna-s-2.1:free", "text.generate");
        await vi.advanceTimersByTimeAsync(1_500);
        expect((await replacement)?.rules).toHaveLength(2);

        // The slow original finally returns an older card with a single meter.
        finishSlow(Response.json([{ provider_model_id: "route-1", skus: [{ ...sku(), meters: [meter("input_text_tokens", 1, 100)] }] }]));
        await vi.advanceTimersByTimeAsync(0);
        expect((await loadPriceCard("poolside", "poolside/laguna-s-2.1:free", "text.generate"))?.rules).toHaveLength(2);
        expect(requests).toHaveLength(2);
    });

    it("uses only the exact executed provider slug when one is supplied", async () => {
        await loadPriceCard("minimax", "canonical", "text.generate", "speech-hd");
        expect(requests[0].searchParams.get("provider_model_slug")).toBe("eq.speech-hd");
        expect(requests[0].searchParams.has("or")).toBe(false);
    });

    it("quotes reserved characters in canonical/provider-slug alternatives", async () => {
        const model = 'model,or(foo)."quoted"\\bar';
        await loadPriceCard("poolside", model, "text.generate");
        expect(requests[0].searchParams.get("or")).toBe(`(model_slug.eq.${JSON.stringify(model)},provider_model_slug.eq.${JSON.stringify(model)})`);
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

    it("merges SKUs across matching routes newest first", async () => {
        respond = async () => Response.json([
            { provider_model_id: "route-old", skus: [{ ...sku(), sku_id: "old", provider_model_id: "route-old", effective_from: "2026-07-01T00:00:00Z", meters: [] }] },
            { provider_model_id: "route-1", skus: rows },
            { provider_model_id: "route-empty", skus: [] },
        ]);
        const card = await loadPriceCard("poolside", "free", "text.generate");
        expect(card?.effective_from).toBe("2026-07-01T00:00:00.000Z");
        expect(card?.rules.map((rule) => rule.id)).toEqual(["input_text_tokens", "output_text_tokens"]);
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
        respond = async () => Response.json([{ provider_model_id: "route-1", skus: rows }]);
        expect(await loadPriceCard("poolside", "free", "text.generate")).not.toBeNull();
        expect(requests).toHaveLength(2);
    });
});
