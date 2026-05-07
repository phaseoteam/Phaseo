import { beforeAll, describe, expect, it } from "vitest";
import {
    LIVE_RUN,
    assertDoneFrame,
    assertOk,
    extractResponseText,
    extractStreamText,
    getGateway,
    postJson,
    postStream,
    requireGatewayApiKey,
    resolveModelFromCatalog,
    resolveProvidersForModel,
    usageFromPayload,
    usageTotal,
    hasPricing,
} from "./live-gateway.helpers";

const LIVE_DEEPSEEK_V4_FLASH_RUN = (process.env.LIVE_DEEPSEEK_V4_FLASH_RUN ?? "0").trim() === "1";
const MAX_OUTPUT_TOKENS = Number(process.env.LIVE_DEEPSEEK_V4_FLASH_MAX_OUTPUT_TOKENS ?? "64");
const describeLive = LIVE_RUN && LIVE_DEEPSEEK_V4_FLASH_RUN ? describe : describe.skip;

let model = "deepseek/deepseek-v4-flash";
let providers: string[] = [];

function assertJsonUsageAndPricing(json: any, label: string) {
    const usage = usageFromPayload(json);
    expect(usage, `${label} missing usage`).toBeTruthy();
    expect(usageTotal(usage), `${label} usage should be non-zero`).toBeGreaterThan(0);
    expect(hasPricing(json), `${label} missing pricing/cost`).toBe(true);
}

describeLive("DeepSeek v4 flash multi-provider sweep", () => {
    beforeAll(async () => {
        requireGatewayApiKey();
        model = await resolveModelFromCatalog({
            preferredModelIds: ["deepseek/deepseek-v4-flash"],
            endpoint: "text.generate",
        });
        providers = await resolveProvidersForModel({
            modelId: model,
            endpoint: "text.generate",
        });
        providers = providers.filter(Boolean);
        console.log(`[deepseek-v4-flash] model=${model} providers=${providers.join(", ")}`);
    }, 120_000);

    it("discovers multiple active providers for the model", () => {
        expect(providers.length).toBeGreaterThan(1);
    });

    for (const providerId of [
        "atlascloud",
        "baseten",
        "crofai",
        "deepinfra",
        "deepseek",
        "fireworks",
        "gmicloud",
        "novita",
        "siliconflow",
        "together",
        "venice",
    ]) {
        it(
            `responses_nonstream_${providerId}`,
            async () => {
                if (!providers.includes(providerId)) {
                    console.warn(`[deepseek-v4-flash] skipping ${providerId}; not active in current catalog`);
                    return;
                }

                const result = await postJson("/responses", {
                    model,
                    input: "Reply with exactly: deepseek-v4-flash-ok",
                    max_output_tokens: MAX_OUTPUT_TOKENS,
                    usage: true,
                    meta: true,
                    provider: { only: [providerId] },
                });
                assertOk(result, `/responses ${providerId}`);
                if (!("json" in result)) throw new Error("Expected JSON response");
                expect(extractResponseText(result.json).trim().length).toBeGreaterThan(0);
                assertJsonUsageAndPricing(result.json, `responses_nonstream_${providerId}`);
            },
            120_000,
        );
    }

    it(
        "responses_stream_first_available_provider",
        async () => {
            expect(providers.length).toBeGreaterThan(0);
            const providerId = providers[0];
            const frames = await postStream("/responses", {
                model,
                stream: true,
                input: "Reply with exactly: deepseek-stream-ok",
                max_output_tokens: MAX_OUTPUT_TOKENS,
                usage: true,
                meta: true,
                provider: { only: [providerId] },
            });
            assertDoneFrame(frames);
            expect(extractStreamText(frames).trim().length).toBeGreaterThan(0);
            const usage = usageFromPayload(frames[frames.length - 1]?.json ?? {});
            expect(usageTotal(usage), "stream usage should be non-zero").toBeGreaterThan(0);
        },
        120_000,
    );

    it(
        "gateway_models_entry_matches_discovered_model",
        async () => {
            const result = await getGateway("/gateway/models?limit=250&offset=0");
            assertOk(result, "/gateway/models");
            if (!("json" in result)) throw new Error("Expected JSON");
            const models = Array.isArray(result.json?.models) ? result.json.models : [];
            const found = models.find((entry: any) => String(entry?.model_id ?? "") === model);
            expect(found).toBeTruthy();
        },
        60_000,
    );
});
