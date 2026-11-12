import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), key: vi.fn() }));
vi.mock("@executors/_shared/timing/upstream", () => ({ fetchUpstream: mocks.fetch }));
vi.mock("@providers/keys", () => ({ resolveProviderKey: mocks.key }));
vi.mock("@/runtime/env", () => ({ getBindings: () => ({ NOVITA_API_KEY: "gateway-key" }) }));
import { executor } from "./index";

function args(extra: Record<string, unknown> = {}): ExecutorExecuteArgs {
	return { workspaceId: "ws", requestId: "speech", providerId: "novita", providerModelSlug: "s1", endpoint: "audio.speech", byokMeta: [], pricingCard: {}, meta: {}, ir: { model: "fish-audio/s1", input: "Hello", ...extra } };
}
beforeEach(() => {
	vi.resetAllMocks();
	mocks.key.mockReturnValue({ source: "gateway", key: "gateway-key", byokId: null });
});
describe("Novita Fish Audio S1 speech", () => {
	it("rejects Google configuration retained only in the raw public request", async () => {
		expect((await executor(args({ rawRequest: { config: { google: { voice: "voice" } } } }))).upstream.status).toBe(400);
		expect(mocks.fetch).not.toHaveBeenCalled();
	});
	it("prevents replay after uncertain speech submission", async () => {
		mocks.fetch.mockRejectedValue(new Error("connection lost"));
		expect(await executor(args())).toMatchObject({ terminal: true, upstream: expect.objectContaining({ status: 502 }) });
	});
	it("accepts speech decoded by the public API with absent vendor configuration", async () => {
		mocks.fetch.mockResolvedValue(new Response("audio"));
		const request = args({ vendor: { elevenlabs: undefined, minimax: undefined } });
		expect((await executor(request)).kind).toBe("stream");
	});
	it.each(["mp3", "wav", "pcm", "opus"])("streams %s bytes and accounts for input characters", async format => {
		mocks.fetch.mockResolvedValue(new Response("audio bytes", { headers: { "Content-Type": "audio/mpeg", "x-request-id": "native" } }));
		const result = await executor(args({ responseFormat: format, voice: "reference-voice", speed: 1.2 }));
		expect(mocks.fetch.mock.calls[0][1]).toBe("https://api.novita.ai/v4beta/txt2speech");
		expect(mocks.fetch.mock.calls[0][2].headers).toMatchObject({ Authorization: "Bearer gateway-key", model: "s1" });
		expect(JSON.parse(mocks.fetch.mock.calls[0][2].body)).toEqual({ text: "Hello", format, reference_id: "reference-voice", prosody: { speed: 1.2 } });
		expect(result.kind).toBe("stream");
		if (result.kind !== "stream") throw new Error("Expected binary stream");
		expect(await new Response(result.stream).text()).toBe("audio bytes");
		expect(await result.usageFinalizer()).toMatchObject({ usage: { input_characters: 5, requests: 1 }, upstream_id: "native" });
	});
	it("preserves BYOK attribution", async () => {
		mocks.key.mockReturnValue({ source: "byok", key: "customer-key", byokId: "byok-id" });
		mocks.fetch.mockResolvedValue(new Response("audio"));
		const result = await executor(args());
		expect(result).toMatchObject({ keySource: "byok", byokKeyId: "byok-id" });
		expect(mocks.fetch.mock.calls[0][2].headers.Authorization).toBe("Bearer customer-key");
	});
	it("passes fragmented binary chunks through and propagates cancellation", async () => {
		const cancel = vi.fn();
		const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.enqueue(new Uint8Array([3])); }, cancel });
		mocks.fetch.mockResolvedValue(new Response(stream));
		const result = await executor(args());
		if (result.kind !== "stream") throw new Error("Expected stream");
		const reader = result.stream.getReader();
		expect((await reader.read()).value).toEqual(new Uint8Array([1, 2]));
		expect((await reader.read()).value).toEqual(new Uint8Array([3]));
		await reader.cancel("client disconnected");
		expect(cancel).toHaveBeenCalledWith("client disconnected");
	});
	it.each([{ responseFormat: "flac" }, { streamFormat: "sse" }, { instructions: "whisper" }, { voice: { id: "voice" } }])("fails closed on unsupported speech controls", async extra => {
		const result = await executor(args(extra));
		expect(result.upstream.status).toBe(400);
		expect(mocks.fetch).not.toHaveBeenCalled();
	});
	it("does not account for characters on upstream rejection", async () => {
		mocks.fetch.mockResolvedValue(Response.json({ error: "invalid voice" }, { status: 400 }));
		const result = await executor(args());
		expect(result.kind).toBe("completed");
		expect(result.bill.usage).toBeUndefined();
	});
	it("rejects unreviewed models", async () => {
		const request = args();
		request.providerModelSlug = "s2-pro";
		expect((await executor(request)).upstream.status).toBe(400);
		expect(mocks.fetch).not.toHaveBeenCalled();
	});
});
