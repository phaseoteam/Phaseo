import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeBillSummary } from "./engine";
import type { PriceCard, PriceRule } from "./types";

const dataRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    "../../../../../packages/data/catalog/src/data");

function card(model: string, capability = "text.generate"): PriceCard {
    const raw = JSON.parse(fs.readFileSync(path.join(dataRoot, "pricing/venice",
        model.replaceAll("/", "-"), capability, "pricing.json"), "utf8"));
    return {
        provider: "venice", model, endpoint: capability, currency: "USD",
        effective_from: null, effective_to: null, version: null,
        rules: raw.rules.map((rule: PriceRule) => ({
            ...rule, price_per_unit: String(rule.price_per_unit),
        })),
    };
}

describe("Venice September catalog pricing", () => {
    it("exposes the four new standard text routes under existing canonical IDs", () => {
        const rows = JSON.parse(fs.readFileSync(path.join(dataRoot, "api_providers/venice/models.json"), "utf8"));
        for (const [slug, model] of Object.entries({
            "gemini-3-8-flash": "google/gemini-3.8-flash",
            "claude-fable-5-1": "anthropic/claude-fable-5.1",
            "openai-gpt-6-astra": "openai/gpt-6-astra",
            "openai-gpt-6-astra-pro": "openai/gpt-6-astra-pro",
        })) {
            expect(rows.find((row: { provider_model_slug: string }) => row.provider_model_slug === slug)).toMatchObject({
                internal_model_id: model, api_model_id: model,
                is_active_gateway: true, routable: true, effective_to: null,
            });
        }
    });

    it.each([
        ["openai/gpt-6-astra", 272000, 10, 1, 12.5, 50],
        ["openai/gpt-6-astra", 272001, 20, 2, 25, 75],
        ["openai/gpt-6-astra-pro", 272000, 12.5, 1.25, 15.625, 62.5],
        ["openai/gpt-6-astra-pro", 272001, 25, 2.5, 31.25, 93.75],
    ])("prices %s at %i context tokens without overlapping tiers", (model, inputTokens, input, cacheRead, cacheWrite, output) => {
        const priceCard = card(String(model));
        for (const [meter, expected] of Object.entries({
            input_text_tokens: input, cached_read_text_tokens: cacheRead,
            cached_write_text_tokens: cacheWrite, output_text_tokens: output,
        })) {
            const bill = computeBillSummary({ input_tokens: inputTokens, [meter]: 1000 }, priceCard);
            const lines = bill.lines.filter(line => line.dimension === meter);
            expect(lines).toHaveLength(1);
            expect(lines[0].line_nanos).toBe(Number(expected) * 1_000_000);
        }
    });

    it("uses the reduced Gemini 3.6 Flash rates", () => {
        const bill = computeBillSummary({ input_text_tokens: 1000, output_text_tokens: 1000 }, card("google/gemini-3.6-flash"));
        expect(bill.lines.map(line => line.line_nanos)).toEqual([937500, 4687500]);
    });

    it("keeps the Kimi K3 fast route distinct from standard pricing", () => {
        const priceCard = card("moonshotai/kimi-k3");
        const standard = computeBillSummary({ output_text_tokens: 1000 }, priceCard);
        const fast = computeBillSummary({ output_text_tokens: 1000 }, priceCard, {}, "fast");
        expect(standard.lines[0].line_nanos).toBe(18_750_000);
        expect(fast.lines[0].line_nanos).toBe(22_500_000);
    });

    it("selects explicit image quality and subtracts the included input image", () => {
        const priceCard = card("openai/gpt-image-2", "image.edit");
        const options = { image_params: { resolution: "2K", quality: "low" } };
        const included = computeBillSummary({ output_image: 1, input_image: 1 }, priceCard, options);
        expect(included.lines.find(line => line.dimension === "output_image")?.line_nanos).toBe(30_000_000);
        expect(included.lines.find(line => line.dimension === "input_image")?.line_nanos).toBe(0);
        const extra = computeBillSummary({ input_image: 3 }, priceCard, options);
        expect(extra.lines[0].line_nanos).toBe(18_400_000);
    });

    it("uses characters for speech and seconds for transcription", () => {
        const speech = computeBillSummary({ input_characters: 1000 }, card("hexgrad/kokoro-82m", "audio.speech"));
        expect(speech.lines[0].line_nanos).toBe(3_500_000);
        const transcription = computeBillSummary({ input_audio_seconds: 60 }, card("openai/whisper-large-v3", "audio.transcription"));
        expect(transcription.lines[0].line_nanos).toBe(6_000_000);
    });

    it("charges one music request at each duration boundary", () => {
        const priceCard = card("eleven-labs/music", "music.generate");
        for (const [duration, expected] of [[60, 690_000_000], [61, 1_380_000_000]]) {
            const bill = computeBillSummary({ requests: 1 }, priceCard, { duration_seconds: duration });
            expect(bill.lines).toHaveLength(1);
            expect(bill.lines[0].line_nanos).toBe(expected);
        }
    });

    it("keeps unsupported Venice endpoints and E2EE routes disabled and linked to existing models", () => {
        for (const provider of ["venice", "venice-e2ee"]) {
            const rows = JSON.parse(fs.readFileSync(path.join(dataRoot, "api_providers", provider, "models.json"), "utf8"));
            for (const row of rows) {
                if (provider === "venice" && row.capabilities.every((cap: { capability_id: string }) => cap.capability_id === "text.generate")) continue;
                expect(row.is_active_gateway).toBe(false);
                expect(row.routable).toBe(false);
                expect(row.routing_status).toBe("disabled");
                if (!row.effective_to) {
                    expect(fs.existsSync(path.join(dataRoot, "models", row.internal_model_id, "model.json"))).toBe(true);
                }
            }
        }
    });
});
