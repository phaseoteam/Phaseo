import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import rows from "./fixtures/lite-pricing-skus.json";
import { __xAiVideoGenerateTestUtils } from "./index";
import { loadPriceCard, __resetPricingLoaderCachesForTests } from "@pipeline/pricing/loader";
import { computeVideoPricedUsage } from "@core/video-pricing";
import { buildVideoPricingRequestOptions } from "@core/video-request-options";
import { reserveVideoGenerationCredits } from "@core/video-reservations";

const state = vi.hoisted(() => ({ client: null as ReturnType<typeof createClient> | null, hold: vi.fn() }));
vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => state.client, getBindings: () => ({}) }));
vi.mock("@core/wallet-reservations", () => ({
    reserveWalletCredits: (...args: unknown[]) => state.hold(...args),
}));
const model = "spacex-ai/grok-imagine-video-1.5-lite";
const upstream = "grok-imagine-video-1.5-lite";

// Snapshot read from Phaseo Prod through Supabase on 2026-10-02.
// Mock only transport and wallet writes; use the real loader, mapper and billing helpers.
beforeEach(() => {
    __resetPricingLoaderCachesForTests();
    state.hold.mockReset().mockResolvedValue({ status: "held", applied: true });
    state.client = createClient("https://pricing.example.com", "test-key", {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: async () => Response.json(rows) },
    });
});

describe("Lite Supabase SKU billing simulation", () => {
    for (const [resolution, rate] of [["480p", 20_000_000], ["720p", 30_000_000], ["1080p", 140_000_000]] as const) {
        for (const seconds of [1, 5, 15]) {
            for (const images of [0, 1]) {
                it(`${resolution}, ${seconds}s, ${images} input image: quote and settlement agree`, async () => {
                    const card = await loadPriceCard("spacex-ai", model, "video.generate", upstream);
                    expect(card?.rules).toHaveLength(4);
                    const mapped = __xAiVideoGenerateTestUtils.buildXAiVideoRequest({
                        model, prompt: "A mountain sunrise", resolution, duration: seconds,
                        ...(images ? { inputImage: "https://example.com/frame.png" } : {}),
                    }, upstream);
                    const options = buildVideoPricingRequestOptions({
                        size: mapped.resolution, resolution: mapped.resolution, input_image_count: mapped.inputImageCount,
                    });
                    const expected = seconds * rate + images * 10_000_000;
                    const settled = computeVideoPricedUsage({ card: card!, model, seconds, requestOptions: options }) as any;
                    expect(settled.pricing.total_nanos).toBe(expected);
                    const reservation = await reserveVideoGenerationCredits({
                        workspaceId: "test", keyId: "test-key", videoId: "test-video",
                        providerId: "spacex-ai", model, seconds, pricingCard: card, requestOptions: options,
                    });
                    expect(reservation.amountNanos).toBe(expected);
                    expect(state.hold).toHaveBeenCalledWith(expect.objectContaining({ amountNanos: expected }));
                });
            }
        }
    }
    it.each([undefined, "1280x720", "1080x1920"])("prices normalized resolution %s", async (resolution) => {
        const card = await loadPriceCard("spacex-ai", model, "video.generate", upstream);
        const mapped = __xAiVideoGenerateTestUtils.buildXAiVideoRequest({ model, prompt: "A sunrise", duration: 5, resolution }, upstream);
        const options = buildVideoPricingRequestOptions({ size: mapped.resolution });
        const priced = computeVideoPricedUsage({ card: card!, model, seconds: 5, requestOptions: options }) as any;
        expect(priced.pricing.total_nanos).toBe(resolution == null ? 100_000_000 : resolution === "1280x720" ? 150_000_000 : 700_000_000);
    });
    it("fails closed if output pricing is missing instead of charging only the image", async () => {
        const card = await loadPriceCard("spacex-ai", model, "video.generate", upstream);
        expect(() => computeVideoPricedUsage({
            card: { ...card!, rules: card!.rules.filter(rule => rule.meter === "input_image") },
            model, seconds: 5, requestOptions: buildVideoPricingRequestOptions({ resolution: "720p", input_image_count: 1 }),
        })).toThrow("video_pricing_primary_rule_missing");
    });
});
