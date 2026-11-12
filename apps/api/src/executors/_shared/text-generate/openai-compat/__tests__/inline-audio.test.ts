import { describe, expect, it } from "vitest";
import type { IRChatRequest, IRContentPart } from "@core/ir";
import { installFetchMock } from "../../../../../../tests/helpers/mock-fetch";
import { inlineAudioUrlsForProvider } from "../inline-audio";
import { irToOpenAIChat } from "../transform-chat";

const MP3 = Uint8Array.from([0x49, 0x44, 0x33]);

function ir(content: IRContentPart[]): IRChatRequest {
	return { model: "m", stream: false, messages: [{ role: "user", content }] };
}

const audioUrl: IRContentPart = { type: "audio", source: "url", data: "https://cdn.example.com/note.mp3" };

describe("audio given by URL on OpenAI-compatible providers", () => {
	it("downloads it and sends base64 input_audio with the format from its MIME type", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://cdn.example.com/note.mp3",
			response: () => new Response(MP3, { status: 200, headers: { "content-type": "audio/mpeg", "content-length": "3" } }),
		}]);
		try {
			const result = await inlineAudioUrlsForProvider(ir([{ type: "text", text: "Transcribe" }, audioUrl]), { providerId: "together", requestId: "req" });
			if (result.ok === false) throw new Error("expected inlined audio");
			const wire = irToOpenAIChat(result.ir, "m", "together");
			expect(wire.messages[0].content[1]).toEqual({ type: "input_audio", input_audio: { data: "SUQz", format: "mp3" } });
		} finally {
			mock.restore();
		}
	});

	it.each(["chutes", "baseten", "reka"])("leaves the URL for %s, whose audio_url part takes it", async (providerId) => {
		const request = ir([audioUrl]);
		const result = await inlineAudioUrlsForProvider(request, { providerId, requestId: "req" });
		expect(result).toEqual({ ok: true, ir: request });
	});

	it("returns a clear 400 when the URL is not audio", async () => {
		const mock = installFetchMock([{
			match: () => true,
			response: () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
		}]);
		try {
			const result = await inlineAudioUrlsForProvider(ir([audioUrl]), { providerId: "novitaai", requestId: "req" });
			if (result.ok) throw new Error("expected a 400");
			expect(result.result.upstream.status).toBe(400);
			expect((await result.result.upstream.json()).error).toBe("unsupported_audio_type");
		} finally {
			mock.restore();
		}
	});
});
