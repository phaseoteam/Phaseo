import { afterEach, beforeEach, expect, it } from "vitest";
import { resolveProviderExecutor } from "../index";
import { installFetchMock, jsonResponse } from "../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../tests/helpers/runtime";

beforeEach(() => setupRuntimeFromEnv({ FRIENDLI_TOKEN: "test-key" } as any));
afterEach(teardownTestRuntime);

it("routes Friendli transcription with native form fields and input-duration billing", async () => {
    let form: FormData | undefined;
    const mock = installFetchMock([{ match: (url, init) => { form = init?.body as FormData; return url === "https://api.friendli.ai/serverless/v1/audio/transcriptions"; }, response: jsonResponse({ text: "Hello", usage: { input_audio_length_ms: 18000, processed_audio_length_ms: 24000 } }) }]);
    try {
        const executor = resolveProviderExecutor("friendli", "audio.transcription")!;
        const result = await executor({ endpoint: "audio.transcription", providerId: "friendli", providerModelSlug: "openai/whisper-large-v3", ir: { model: "openai/whisper-large-v3", file: new Blob(["audio"], { type: "audio/wav" }), language: "en", responseFormat: "json", chunkingStrategy: "auto" }, requestId: "friendli-test", workspaceId: "test", byokMeta: [], pricingCard: { rules: [] }, meta: {} } as any);
        expect(form?.get("model")).toBe("openai/whisper-large-v3");
        expect(form?.get("response_format")).toBeNull();
        expect(form?.get("language")).toBe("en");
        expect(result.bill.usage?.input_audio_seconds).toBe(18);
        expect(result.kind === "completed" && (result.ir as any).text).toBe("Hello");
    } finally { mock.restore(); }
});
