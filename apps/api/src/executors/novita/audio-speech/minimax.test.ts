import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), key: vi.fn() }));
vi.mock("@executors/_shared/timing/upstream", () => ({ fetchUpstream: mocks.fetch }));
vi.mock("@providers/keys", () => ({ resolveProviderKey: mocks.key }));
vi.mock("@/runtime/env", () => ({ getBindings: () => ({ NOVITA_API_KEY: "test" }) }));
import { executor } from "./index";

function args(extra: Record<string, unknown> = {}, model = "minimax-speech-2.8-hd"): ExecutorExecuteArgs {
	return { workspaceId: "ws", requestId: "speech", providerId: "novita", providerModelSlug: model, endpoint: "audio.speech", byokMeta: [], pricingCard: {}, meta: {}, ir: { model: "minimax/speech-2.8-hd", input: "Hello", voice: "English_expressive_narrator", ...extra } };
}
function response(extra: Record<string, unknown> = {}) {
	return Response.json({ base_resp: { status_code: 0 }, data: { audio: "0001ff", status: 2 }, extra_info: { usage_characters: 3 }, trace_id: "native", ...extra });
}
beforeEach(() => {
	vi.resetAllMocks();
	mocks.key.mockReturnValue({ source: "gateway", key: "test", byokId: null });
});
describe("Novita MiniMax Speech 2.8", () => {
	it.each(["minimax-speech-2.8-hd", "minimax-speech-2.8-turbo"])("dispatches %s and bills reported characters rather than input length", async model => {
		mocks.fetch.mockResolvedValue(response());
		const result = await executor(args({ speed: 1.2, vendor: { minimax: undefined, elevenlabs: undefined } }, model));
		expect(mocks.fetch.mock.calls[0][1]).toBe(`https://api.novita.ai/v3/${model}`);
		expect(JSON.parse(mocks.fetch.mock.calls[0][2].body)).toEqual({ text: "Hello", stream: false, output_format: "hex", voice_setting: { voice_id: "English_expressive_narrator", speed: 1.2 }, audio_setting: { format: "mp3" } });
		if (result.kind !== "stream") throw new Error("Expected binary output");
		expect(new Uint8Array(await new Response(result.stream).arrayBuffer())).toEqual(new Uint8Array([0, 1, 255]));
		expect(await result.usageFinalizer()).toMatchObject({ usage: { input_characters: 3, requests: 1 }, upstream_id: "native" });
	});
	it.each([["mp3", "audio/mpeg"], ["wav", "audio/wav"], ["flac", "audio/flac"], ["pcm", "audio/pcm"]])("returns the %s content type", async (format, mime) => {
		mocks.fetch.mockResolvedValue(response());
		expect((await executor(args({ responseFormat: format }))).upstream.headers.get("content-type")).toBe(mime);
	});
	it("uses BYOK credentials and attribution", async () => {
		mocks.key.mockReturnValue({ source: "byok", key: "customer", byokId: "key-id" });
		mocks.fetch.mockResolvedValue(response());
		expect(await executor(args())).toMatchObject({ keySource: "byok", byokKeyId: "key-id" });
		expect(mocks.fetch.mock.calls[0][2].headers.Authorization).toBe("Bearer customer");
	});
	it.each([{ voice: undefined }, { voice: { id: "voice" } }, { responseFormat: "opus" }, { speed: 0.25 }, { speed: 3 }, { streamFormat: "sse" }, { instructions: "whisper" }, { vendor: { minimax: { emotion: "happy" } } }, { input: "a".repeat(10_000) }])("rejects unsupported controls before submission", async extra => {
		expect((await executor(args(extra))).upstream.status).toBe(400);
		expect(mocks.fetch).not.toHaveBeenCalled();
	});
	it.each([{ data: { audio: "xyz", status: 2 } }, { data: { audio: "fff", status: 2 } }, { data: { audio: "", status: 2 } }, { data: { audio: "aa", status: 1 } }, { extra_info: {} }, { extra_info: { usage_characters: -1 } }, { base_resp: {} }])("fails closed on invalid output or usage", async extra => {
		mocks.fetch.mockResolvedValue(response(extra));
		const result = await executor(args());
		expect(result).toMatchObject({ kind: "completed", terminal: true });
		expect(result.upstream.status).toBe(502);
		expect(result.bill.usage).toBeUndefined();
	});
	it.each([[1001, 504], [1002, 429], [1004, 401], [2013, 400]])("maps native error %s to %s without charging", async (code, status) => {
		mocks.fetch.mockResolvedValue(response({ base_resp: { status_code: code, status_msg: "Synthesis failed" } }));
		const result = await executor(args());
		expect(result.upstream.status).toBe(status);
		expect(result.bill.usage).toBeUndefined();
	});
	it("bounds response reads and cancels oversized output", async () => {
		const cancel = vi.fn();
		mocks.fetch.mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(16 * 1024 * 1024 + 1)); }, cancel })));
		expect((await executor(args())).upstream.status).toBe(502);
		expect(cancel).toHaveBeenCalled();
	});
	it("prevents automatic replay after uncertain transport failure", async () => {
		mocks.fetch.mockRejectedValue(new Error("lost connection"));
		expect(await executor(args())).toMatchObject({ kind: "completed", terminal: true });
	});
});
