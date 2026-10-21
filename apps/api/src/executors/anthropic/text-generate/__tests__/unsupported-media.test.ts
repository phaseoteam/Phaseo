// Audio and video content parts on Claude routes: rejected before anything is sent.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { anthropicUnsupportedMediaResult, executeAnthropic } from "../index";
import { installFetchMock } from "../../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../tests/helpers/runtime";

function requestWith(parts: IRChatRequest["messages"][number]["content"]): IRChatRequest {
	return {
		model: "anthropic/claude-sonnet-5",
		stream: true,
		messages: [{ role: "user", content: [{ type: "text", text: "Describe this" }, ...(parts as any[])] }],
	};
}

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

describe("Claude audio and video input", () => {
	it("rejects audio and video parts with a 400 instead of sending them as text", async () => {
		const mock = installFetchMock([]);
		const result = await executeAnthropic({
			ir: requestWith([
				{ type: "audio", source: "data", data: "UklGRlIAAABXQVZF", format: "wav" },
				{ type: "video", source: "url", url: "https://example.com/clip.mp4" },
			]),
			requestId: "req_media",
			workspaceId: "team_test",
			providerId: "anthropic",
			endpoint: "chat.completions",
			protocol: "openai.chat.completions",
			capability: "text.generate",
			providerModelSlug: "claude-sonnet-5",
			byokMeta: [],
			pricingCard: null,
			meta: {},
		} as unknown as ExecutorExecuteArgs);
		mock.restore();

		expect(mock.calls).toHaveLength(0);
		expect(result).toMatchObject({ kind: "completed", terminal: true, localClientError: true });
		expect(result.upstream.status).toBe(400);
		const body = await result.upstream.json() as any;
		expect(body).toMatchObject({ error: "unsupported_content_type", request_id: "req_media" });
		expect(body.message).toContain("audio or video");
	});

	it("checks tool results too, and passes requests without audio or video", () => {
		const withToolAudio: IRChatRequest = {
			model: "claude-sonnet-5",
			stream: false,
			messages: [{
				role: "tool",
				toolResults: [{
					toolCallId: "toolu_1",
					content: "",
					parts: [{ type: "audio", source: "data", data: "UklGRlIAAABXQVZF", format: "wav" }],
				}],
			}],
		};
		expect(anthropicUnsupportedMediaResult(withToolAudio, "req_tool")?.upstream.status).toBe(400);
		expect(anthropicUnsupportedMediaResult(requestWith([
			{ type: "image", source: "url", data: "https://example.com/cat.png" },
		]), "req_ok")).toBeNull();
	});
});
