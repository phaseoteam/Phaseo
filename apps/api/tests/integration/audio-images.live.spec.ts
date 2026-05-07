import { beforeAll, describe, expect, it } from "vitest";
import {
    type BinaryResult,
    LIVE_RUN,
    assertOk,
    hasPricing,
    postJson,
    postMultipart,
    requireGatewayApiKey,
    resolveModelFromCatalog,
    usageFromPayload,
    usageTotal,
} from "./live-gateway.helpers";

const LIVE_AUDIO_IMAGES_RUN = (process.env.LIVE_AUDIO_IMAGES_RUN ?? "0").trim() === "1";
const describeLive = LIVE_RUN && LIVE_AUDIO_IMAGES_RUN ? describe : describe.skip;

let ttsModel = "xiaomi/mimo-v2.5-tts";
let transcriptionModel = "openai/gpt-4o-mini-transcribe";
let translationModel = "openai/gpt-4o-mini-transcribe";
let imageModel = "openai/gpt-image-1-mini";
let ttsFixture: {
    bytes: Buffer;
    mimeType: string;
    filename: string;
} | null = null;

function assertJsonUsageAndPricing(json: any, label: string) {
    const usage = usageFromPayload(json);
    expect(usage, `${label} missing usage`).toBeTruthy();
    expect(usageTotal(usage), `${label} usage should be non-zero`).toBeGreaterThan(0);
    expect(hasPricing(json), `${label} missing pricing/cost`).toBe(true);
}

function assertBinaryAudio(result: BinaryResult, label: string) {
    expect(result.bytes.length, `${label} should return audio bytes`).toBeGreaterThan(0);
    expect(result.contentType.toLowerCase(), `${label} should return audio content`).toContain("audio/");
}

function extractImageCount(payload: any): number {
    const data = Array.isArray(payload?.data) ? payload.data : [];
    return data.filter((item: any) =>
        typeof item?.b64_json === "string" ||
        typeof item?.url === "string" ||
        typeof item?.image_url === "string"
    ).length;
}

async function ensureTtsFixture() {
    if (ttsFixture) return ttsFixture;
    const result = await postJson("/audio/speech", {
        model: ttsModel,
        input: "hello from xiaomi mimo",
        voice: "Mia",
        provider: { only: ["xiaomi"] },
    });
    assertOk(result, "/audio/speech Xiaomi");
    if ("json" in result) throw new Error("Expected binary audio response from Xiaomi TTS");
    assertBinaryAudio(result, "xiaomi_tts");
    const ext = result.contentType.toLowerCase().includes("wav") ? "wav" : "mp3";
    ttsFixture = {
        bytes: result.bytes,
        mimeType: result.contentType || "audio/wav",
        filename: `xiaomi-mimo-sample.${ext}`,
    };
    return ttsFixture;
}

describeLive("Audio and image live coverage", () => {
    beforeAll(async () => {
        requireGatewayApiKey();
        ttsModel = await resolveModelFromCatalog({
            preferredModelIds: ["xiaomi/mimo-v2.5-tts"],
            providerId: "xiaomi",
            endpoint: "audio.speech",
        });
        transcriptionModel = await resolveModelFromCatalog({
            preferredModelIds: ["openai/gpt-4o-mini-transcribe", "openai/gpt-4o-transcribe"],
            providerId: "openai",
            endpoint: "audio.transcription",
        });
        translationModel = await resolveModelFromCatalog({
            preferredModelIds: ["openai/whisper-1", "openai/gpt-4o-mini-transcribe", "openai/gpt-4o-transcribe"],
            providerId: "openai",
            endpoint: "audio.translations",
        });
        imageModel = await resolveModelFromCatalog({
            preferredModelIds: ["openai/gpt-image-1-mini", "openai/gpt-image-1"],
            providerId: "openai",
            endpoint: "images.generations",
        });

        console.log(
            `[audio-images] ttsModel=${ttsModel} transcriptionModel=${transcriptionModel} translationModel=${translationModel} imageModel=${imageModel}`,
        );
    }, 120_000);

    it(
        "xiaomi_mimo_tts",
        async () => {
            const fixture = await ensureTtsFixture();
            expect(fixture.bytes.length).toBeGreaterThan(0);
            expect(fixture.mimeType.toLowerCase()).toContain("audio/");
        },
        180_000,
    );

    it(
        "openai_mini_transcribe_transcription",
        async () => {
            const fixture = await ensureTtsFixture();
            const result = await postMultipart("/audio/transcriptions", (form) => {
                form.set("model", transcriptionModel);
                form.set("provider", JSON.stringify({ only: ["openai"] }));
                form.set("file", new Blob([fixture.bytes], { type: fixture.mimeType }), fixture.filename);
            });
            assertOk(result, "/audio/transcriptions");
            if (!("json" in result)) throw new Error("Expected JSON response from transcription endpoint");
            const text = String(result.json?.text ?? result.json?.transcript ?? "");
            expect(text.length).toBeGreaterThan(0);
            assertJsonUsageAndPricing(result.json, "openai_mini_transcribe_transcription");
        },
        180_000,
    );

    it(
        "openai_translation",
        async () => {
            const fixture = await ensureTtsFixture();
            const result = await postMultipart("/audio/translations", (form) => {
                form.set("model", translationModel);
                form.set("provider", JSON.stringify({ only: ["openai"] }));
                form.set("file", new Blob([fixture.bytes], { type: fixture.mimeType }), fixture.filename);
            });
            assertOk(result, "/audio/translations");
            if (!("json" in result)) throw new Error("Expected JSON response from translation endpoint");
            const text = String(result.json?.text ?? result.json?.transcript ?? "");
            expect(text.length).toBeGreaterThan(0);
            assertJsonUsageAndPricing(result.json, "openai_translation");
        },
        180_000,
    );

    it(
        "openai_gpt_image_1_mini",
        async () => {
            const result = await postJson("/images/generations", {
                model: imageModel,
                prompt: "a tiny blue square on a white background",
                n: 1,
                size: "1024x1024",
                usage: true,
                meta: true,
                provider: { only: ["openai"] },
            });
            assertOk(result, "/images/generations");
            if (!("json" in result)) throw new Error("Expected JSON response from image generation endpoint");
            expect(extractImageCount(result.json), "image generation should return image data").toBeGreaterThan(0);
            assertJsonUsageAndPricing(result.json, "openai_gpt_image_1_mini");
        },
        180_000,
    );
});
