import { afterEach, beforeEach, expect, it } from "vitest";
import { executor } from "./index";
import { installFetchMock } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
beforeEach(() => setupRuntimeFromEnv({ OVH_AI_ENDPOINTS_ACCESS_TOKEN: "test-key" } as any));
afterEach(teardownTestRuntime);
it.each(["en-us", "de-de", "es-es", "it-it"])("routes the %s Riva voice to its own native endpoint", async locale => {
	const mock = installFetchMock([{ match: url => url === `https://nvr-tts-${locale}.endpoints.kepler.ai.cloud.ovh.net/api/v1/tts/text_to_audio`, response: new Response("audio", { headers: { "Content-Type": "audio/wav" } }) }]);
	try {
		const result = await executor({ ir: { model: `nvidia/riva-tts-${locale}`, input: "hello", responseFormat: "wav" }, providerModelSlug: `nvr-tts-${locale}`, providerId: "ovhcloud", endpoint: "audio.speech", requestId: "test", workspaceId: "test", byokMeta: [], pricingCard: {}, meta: {} });
		expect(mock.calls[0].bodyJson).toMatchObject({ text: "hello", encoding: 1, sample_rate_hz: 16000 });
		expect(result.kind).toBe("stream");
		if (result.kind === "stream") expect(await new Response(result.stream).text()).toBe("audio");
		expect(result.bill.usage?.input_characters).toBe(5);
	} finally { mock.restore(); }
});
