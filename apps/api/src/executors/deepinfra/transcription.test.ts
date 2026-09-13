import { afterEach, beforeEach, expect, it } from "vitest";
import { resolveProviderExecutor } from "../index";
import { installFetchMock, jsonResponse } from "../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../tests/helpers/runtime";

beforeEach(() => setupRuntimeFromEnv({ DEEPINFRA_API_KEY: "test-key" } as any));
afterEach(teardownTestRuntime);
it("uses DeepInfra multipart timestamp fields and input length for billing", async () => {
    let form: FormData | undefined;
    const mock = installFetchMock([{ match: (url, init) => { form = init?.body as FormData; return url === "https://api.deepinfra.com/v1/audio/transcriptions"; }, response: jsonResponse({ text: "Hello", input_length_ms: 18000, duration: 24 }) }]);
    try {
        const result = await resolveProviderExecutor("deepinfra", "audio.transcription")!({ endpoint: "audio.transcription", providerId: "deepinfra", providerModelSlug: "openai/whisper-large-v3", ir: { model: "openai/whisper-large-v3", file: new Blob(["audio"], { type: "audio/wav" }), responseFormat: "verbose_json", timestampGranularities: ["word"] }, requestId: "test", workspaceId: "test", byokMeta: [], pricingCard: { rules: [] }, meta: {} } as any);
        expect(form?.get("model")).toBe("openai/whisper-large-v3");
        expect(form?.getAll("timestamp_granularities")).toEqual(["word"]);
        expect(form?.get("timestamp_granularities[]")).toBeNull();
        expect(result.bill.usage?.input_audio_seconds).toBe(18);
    } finally { mock.restore(); }
});
