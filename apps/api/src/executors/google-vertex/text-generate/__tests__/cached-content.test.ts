import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "../index";
import { installFetchMock } from "../../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

function buildArgs(byok: boolean): ExecutorExecuteArgs {
	const ir: IRChatRequest = {
		model: "google/gemini-3.6-flash",
		stream: false,
		messages: [{ role: "user", content: [{ type: "text", text: "Summarise the cached report." }] }],
		googleCachedContent: "projects/other-project/locations/global/cachedContents/abc123",
	};
	return {
		ir,
		requestId: "req_google_vertex_cached_content",
		workspaceId: "team_test",
		providerId: "google-vertex",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		providerModelSlug: "gemini-3.6-flash",
		capabilityParams: null,
		byokMeta: byok
			? [{ id: "byok_vertex", key: "customer-vertex-token", providerId: "google-vertex", alwaysUse: true }]
			: [],
		pricingCard: null as any,
		meta: {},
	} as ExecutorExecuteArgs;
}

const GEMINI_STREAM = `data: ${JSON.stringify({
	candidates: [{ index: 0, content: { role: "model", parts: [{ text: "Done." }] }, finishReason: "STOP" }],
	usageMetadata: { promptTokenCount: 4_100, cachedContentTokenCount: 4_000, candidatesTokenCount: 2, totalTokenCount: 4_102 },
})}\r\n\r\n`;

describe("google-vertex cachedContent", () => {
	it("refuses cachedContent with Phaseo's credential, before any upstream call", async () => {
		const mock = installFetchMock([{
			match: (url) => url.includes(":streamGenerateContent"),
			response: new Response(GEMINI_STREAM, { headers: { "Content-Type": "text/event-stream" } }),
		}]);
		try {
			const result = await execute(buildArgs(false));
			expect(result.kind).toBe("completed");
			if (result.kind !== "completed") return;
			expect(result.upstream.status).toBe(400);
			expect(await result.upstream.json()).toEqual({ error: "cachedContent requires a customer-managed Vertex AI credential" });
			expect(result.keySource).toBe("gateway");
			expect(mock.calls).toHaveLength(0);
		} finally {
			mock.restore();
		}
	});

	it("sends cachedContent with the customer's own credential", async () => {
		const mock = installFetchMock([{
			match: (url) => url.includes(":streamGenerateContent"),
			response: new Response(GEMINI_STREAM, { headers: { "Content-Type": "text/event-stream" } }),
		}]);
		try {
			const result = await execute(buildArgs(true));
			expect(result.kind).toBe("completed");
			if (result.kind !== "completed") return;
			expect(result.upstream.status).toBe(200);
			expect(result.keySource).toBe("byok");
			expect(mock.calls).toHaveLength(1);
			expect(mock.calls[0]?.headers.Authorization ?? mock.calls[0]?.headers.authorization).toBe("Bearer customer-vertex-token");
			expect(mock.calls[0]?.bodyJson?.cachedContent).toBe("projects/other-project/locations/global/cachedContents/abc123");
		} finally {
			mock.restore();
		}
	});
});
