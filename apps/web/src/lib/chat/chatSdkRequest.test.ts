import { sdkRequestFromTextThread } from "@/components/(chat)/chatSdkRequest";
import type { ChatThread } from "@/lib/indexeddb/chats";

const thread: ChatThread = {
	id: "chat-1",
	sessionId: "session-that-must-not-leak",
	title: "Saved chat",
	modelId: "phaseo/free",
	createdAt: "2026-09-21T10:00:00Z",
	updatedAt: "2026-09-21T10:01:00Z",
	settings: {
		temperature: 0.3,
		maxOutputTokens: 256,
		stream: true,
		providerId: "openai",
		serviceTier: "priority",
		reasoningEnabled: false,
		apiServerToolsEnabled: false,
	},
	messages: [
		{ id: "u1", role: "user", content: "First question", createdAt: "2026-09-21T10:00:00Z" },
		{ id: "a1", role: "assistant", content: "First answer", createdAt: "2026-09-21T10:00:10Z" },
		{ id: "u2", role: "user", content: "Follow up", createdAt: "2026-09-21T10:01:00Z", meta: { request_context: { model_id: "openai/gpt-5", reasoning_enabled: true, reasoning_effort: "high" } } },
		{ id: "a2", role: "assistant", content: "Latest answer", createdAt: "2026-09-21T10:01:10Z", meta: { request_id: "req_123" } },
	],
};

test("reconstructs the latest saved text request without session identifiers", () => {
	const request = sdkRequestFromTextThread(thread, "http://localhost:8787/v1");
	expect(request).toMatchObject({ endpoint: "/responses", baseUrl: "http://localhost:8787/v1", requestId: "req_123" });
	expect(request?.body).toMatchObject({
		model: "openai/gpt-5",
		temperature: 0.3,
		max_output_tokens: 256,
		service_tier: "priority",
		provider: { only: ["openai"] },
		reasoning: { effort: "high" },
	});
	expect(request?.body).not.toHaveProperty("session_id");
	expect(request?.body.input).toEqual(expect.arrayContaining([
		{ role: "user", content: "First question" },
		{ role: "assistant", content: "First answer" },
		{ role: "user", content: "Follow up" },
	]));
	expect(JSON.stringify(request?.body.input)).not.toContain("Latest answer");
});

test("does not offer code until a chat has a user request", () => {
	expect(sdkRequestFromTextThread({ ...thread, messages: [] })).toBeNull();
});

test("reconstructs persisted inline attachments", () => {
	const request = sdkRequestFromTextThread({
		...thread,
		messages: [{
			id: "u-image",
			role: "user",
			content: "Describe this",
			createdAt: "2026-09-21T10:00:00Z",
			meta: {
				request_context: { model_id: "openai/gpt-5", attachments_count: 1 },
				attachment_previews: [{ name: "example.png", mimeType: "image/png", dataUrl: "data:image/png;base64,abc", isImage: true, isAudio: false, isVideo: false }],
			},
		}],
	});
	expect(request?.body.input).toEqual(expect.arrayContaining([{
		role: "user",
		content: [
			{ type: "input_text", text: "Describe this" },
			{ type: "input_image", image_url: "data:image/png;base64,abc" },
		],
	}]));
});

test("suppresses samples when a persisted attachment cannot be reproduced", () => {
	const request = sdkRequestFromTextThread({
		...thread,
		messages: [{
			id: "u-file",
			role: "user",
			content: "[Attachment] document.pdf",
			createdAt: "2026-09-21T10:00:00Z",
			meta: { request_context: { attachments_count: 1 } },
		}],
	});
	expect(request).toBeNull();
});

test("preserves image-output modalities and disables streaming", () => {
	const request = sdkRequestFromTextThread({
		...thread,
		settings: { ...thread.settings, imageOutputEnabled: true, stream: true },
	});
	expect(request?.body).toMatchObject({ stream: false, modalities: ["text", "image"] });
});
