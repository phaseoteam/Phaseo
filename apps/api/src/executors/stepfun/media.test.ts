import { afterEach, beforeEach, expect, it } from "vitest";
import { resolveProviderExecutor } from "../index";
import { installFetchMock, jsonResponse } from "../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../tests/helpers/runtime";

beforeEach(() => setupRuntimeFromEnv({ STEPFUN_API_KEY: "test-key" } as any));
afterEach(teardownTestRuntime);
const args = (endpoint: string, model: string, ir: any) => ({ endpoint, providerId: "stepfun", providerModelSlug: model, ir: { model: `stepfun/${model}`, ...ir }, requestId: "step-media", workspaceId: "test", byokMeta: [], pricingCard: { rules: [] }, meta: {} }) as any;

it("maps generation dimensions and native Step image controls", async () => {
    const mock = installFetchMock([{ match: url => url.endsWith("/images/generations"), response: jsonResponse({ data: [{ b64_json: "aGVsbG8=" }] }) }]);
    try {
        const result = await resolveProviderExecutor("stepfun", "image.generate")!(args("images.generations", "step-image-edit-2", { prompt: "A mountain", size: "1360x768", rawRequest: { steps: 8, cfg_scale: 2, seed: 4, text_mode: true } }));
        expect(mock.calls[0].bodyJson).toMatchObject({ size: "768x1360", steps: 8, cfg_scale: 2, seed: 4, text_mode: true });
        expect(result.bill.usage?.output_image).toBe(1);
    } finally { mock.restore(); }
});

it("uses the singular image upload field for editing", async () => {
    let form: FormData | undefined;
    const mock = installFetchMock([{ match: (url, init) => { form = init?.body as FormData; return url.endsWith("/images/edits"); }, response: jsonResponse({ data: [{ url: "https://example.com/image.png" }] }) }]);
    try {
        await resolveProviderExecutor("stepfun", "image.edit")!(args("images.edits", "step-image-edit-2", { prompt: "Change the sky", image: new Blob(["image"], { type: "image/png" }), rawRequest: { steps: 8 } }));
        expect(form?.get("image")).toBeInstanceOf(Blob);
        expect(form?.get("image[]")).toBeNull();
        expect(form?.get("steps")).toBe("8");
    } finally { mock.restore(); }
});

it("maps speech instructions and native controls while counting billable characters", async () => {
    const mock = installFetchMock([{ match: url => url.endsWith("/audio/speech"), response: new Response("audio", { headers: { "Content-Type": "audio/mpeg" } }) }]);
    try {
        const result = await resolveProviderExecutor("stepfun", "audio.speech")!(args("audio.speech", "stepaudio-2.5-tts", { input: "你好Hi", voice: "zixinnansheng", instructions: "Calm", rawRequest: { config: { stepfun: { volume: 1.2, sample_rate: 24000 } } } }));
        expect(mock.calls[0].bodyJson).toMatchObject({ instruction: "Calm", volume: 1.2, sample_rate: 24000 });
        expect(result.bill.usage?.input_characters).toBe(3);
    } finally { mock.restore(); }
});

it("buffers native ASR SSE and bills PCM duration rather than token counts", async () => {
    const mock = installFetchMock([{ match: url => url.endsWith("/audio/asr/sse"), response: new Response('data: {"type":"transcript.text.delta","delta":"Hi"}\n\ndata: {"type":"transcript.text.done","text":"Hi","usage":{"input_tokens":1000}}\n\n', { headers: { "Content-Type": "text/event-stream" } }) }]);
    try {
        const result = await resolveProviderExecutor("stepfun", "audio.transcription")!(args("audio.transcription", "stepaudio-2.5-asr", { file: new Blob([new Uint8Array(16000)], { type: "audio/pcm" }), keywords: ["Phaseo"], rawRequest: { config: { stepfun: { format: { type: "pcm", rate: 16000, bits: 16, channel: 1 } } } } }));
        expect(mock.calls[0].bodyJson.audio.input.transcription).toMatchObject({ model: "stepaudio-2.5-asr", hotwords: ["Phaseo"] });
        expect(result.bill.usage?.input_audio_seconds).toBe(0.5);
        expect(result.kind === "completed" && (result.ir as any).text).toBe("Hi");
    } finally { mock.restore(); }
});

it.each(["audio/flac", "audio/aac", "audio/x-m4a", "audio/mp4", "video/mp4", "audio/webm", "video/webm"])("rejects unsupported %s transcription audio before upload", async mime => {
    const mock = installFetchMock([]);
    try {
        const result = await resolveProviderExecutor("stepfun", "audio.transcription")!(args("audio.transcription", "stepaudio-2.5-asr", { file: new Blob([new Uint8Array(64)], { type: mime }) }));
        expect(result.upstream.status).toBe(400);
        expect(mock.calls).toHaveLength(0);
    } finally { mock.restore(); }
});

it("rejects a declared transcription format that conflicts with the upload", async () => {
    const mock = installFetchMock([]);
    try {
        const result = await resolveProviderExecutor("stepfun", "audio.transcription")!(args("audio.transcription", "stepaudio-2.5-asr", { file: new Blob([new Uint8Array(64)], { type: "audio/mpeg" }), rawRequest: { config: { stepfun: { format: { type: "wav" } } } } }));
        expect(result.upstream.status).toBe(400);
        expect(mock.calls).toHaveLength(0);
    } finally { mock.restore(); }
});
