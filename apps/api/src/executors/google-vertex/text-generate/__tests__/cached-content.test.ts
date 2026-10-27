import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute, resolveVertexApiBase } from "../index";
import { installFetchMock } from "../../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

function buildArgs(
	byok: boolean,
	options: { key?: string; cachedContent?: string | null; model?: string } = {},
): ExecutorExecuteArgs {
	const model = options.model ?? "gemini-3.6-flash";
	const ir: IRChatRequest = {
		model: `google/${model}`,
		stream: false,
		messages: [{ role: "user", content: [{ type: "text", text: "Summarise the cached report." }] }],
		...(options.cachedContent === null ? {} : {
			googleCachedContent: options.cachedContent ?? "projects/other-project/locations/global/cachedContents/abc123",
		}),
	};
	return {
		ir,
		requestId: "req_google_vertex_cached_content",
		workspaceId: "team_test",
		providerId: "google-vertex",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		providerModelSlug: model,
		capabilityParams: null,
		byokMeta: byok
			? [{ id: "byok_vertex", key: options.key ?? "customer-vertex-token", providerId: "google-vertex", alwaysUse: true }]
			: [],
		pricingCard: null as any,
		meta: {},
	} as ExecutorExecuteArgs;
}

// A credential JSON carrying a ready token, so no OAuth exchange is needed in the test.
const CUSTOMER_CREDENTIAL = JSON.stringify({
	project_id: "customer-project",
	region: "europe-west4",
	access_token: "customer-vertex-token",
});

const GEMINI_STREAM = `data: ${JSON.stringify({
	candidates: [{ index: 0, content: { role: "model", parts: [{ text: "Done." }] }, finishReason: "STOP" }],
	usageMetadata: { promptTokenCount: 4_100, cachedContentTokenCount: 4_000, candidatesTokenCount: 2, totalTokenCount: 4_102 },
})}\r\n\r\n`;

function mockGemini() {
	return installFetchMock([{
		match: (url) => url.includes(":streamGenerateContent"),
		response: new Response(GEMINI_STREAM, { headers: { "Content-Type": "text/event-stream" } }),
	}]);
}

describe("google-vertex cachedContent", () => {
	it("refuses cachedContent with Phaseo's credential, before any upstream call", async () => {
		const mock = mockGemini();
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

	it("sends cachedContent with the customer's own credential, to the cache's project and location", async () => {
		const mock = mockGemini();
		try {
			const result = await execute(buildArgs(true));
			expect(result.kind).toBe("completed");
			if (result.kind !== "completed") return;
			expect(result.upstream.status).toBe(200);
			expect(result.keySource).toBe("byok");
			expect(mock.calls).toHaveLength(1);
			expect(mock.calls[0]?.url).toBe(
				"https://api.vertex.example/v1/projects/other-project/locations/global/publishers/google/models/gemini-3.6-flash:streamGenerateContent?alt=sse",
			);
			expect(mock.calls[0]?.headers.Authorization ?? mock.calls[0]?.headers.authorization).toBe("Bearer customer-vertex-token");
			expect(mock.calls[0]?.bodyJson?.cachedContent).toBe("projects/other-project/locations/global/cachedContents/abc123");
		} finally {
			mock.restore();
		}
	});

	it("expands a short cache name with the project and region of the customer's credential", async () => {
		const mock = mockGemini();
		try {
			const result = await execute(buildArgs(true, { key: CUSTOMER_CREDENTIAL, cachedContent: "cachedContents/abc123" }));
			expect(result.kind).toBe("completed");
			if (result.kind !== "completed") return;
			expect(result.upstream.status).toBe(200);
			expect(mock.calls).toHaveLength(1);
			expect(mock.calls[0]?.url).toBe(
				"https://api.vertex.example/v1/projects/customer-project/locations/europe-west4/publishers/google/models/gemini-3.6-flash:streamGenerateContent?alt=sse",
			);
			expect(mock.calls[0]?.headers.Authorization ?? mock.calls[0]?.headers.authorization).toBe("Bearer customer-vertex-token");
			expect(mock.calls[0]?.bodyJson?.cachedContent).toBe("projects/customer-project/locations/europe-west4/cachedContents/abc123");
		} finally {
			mock.restore();
		}
	});

	it("refuses a short cache name when the credential names no project or region", async () => {
		const mock = mockGemini();
		try {
			for (const key of ["customer-vertex-token", JSON.stringify({ project_id: "customer-project", access_token: "customer-vertex-token" })]) {
				const result = await execute(buildArgs(true, { key, cachedContent: "cachedContents/abc123" }));
				expect(result.kind).toBe("completed");
				if (result.kind !== "completed") return;
				expect(result.upstream.status).toBe(400);
				expect((await result.upstream.json()).error).toContain("projects/{project}/locations/{location}/cachedContents/{id}");
			}
			expect(mock.calls).toHaveLength(0);
		} finally {
			mock.restore();
		}
	});

	it("refuses a cache outside the only location a model is served in", async () => {
		const mock = mockGemini();
		try {
			const result = await execute(buildArgs(true, {
				model: "gemini-3.1-flash-lite",
				cachedContent: "projects/customer-project/locations/us-central1/cachedContents/abc123",
			}));
			expect(result.kind).toBe("completed");
			if (result.kind !== "completed") return;
			expect(result.upstream.status).toBe(400);
			expect(await result.upstream.json()).toEqual({
				error: "This model is served on Vertex AI only in global, but the cache is in us-central1",
			});
			expect(mock.calls).toHaveLength(0);
		} finally {
			mock.restore();
		}
	});

	it("runs a request with the customer's service account in the customer's project", async () => {
		const mock = mockGemini();
		try {
			const result = await execute(buildArgs(true, { key: CUSTOMER_CREDENTIAL, cachedContent: null }));
			expect(result.kind).toBe("completed");
			if (result.kind !== "completed") return;
			expect(result.upstream.status).toBe(200);
			expect(mock.calls[0]?.url).toBe(
				"https://api.vertex.example/v1/projects/customer-project/locations/europe-west4/publishers/google/models/gemini-3.6-flash:streamGenerateContent?alt=sse",
			);
			expect(mock.calls[0]?.bodyJson?.cachedContent).toBeUndefined();
		} finally {
			mock.restore();
		}
	});

	it("builds the regional Google host for the customer's location", () => {
		const bindings = { GOOGLE_VERTEX_PROJECT: "phaseo-project", GOOGLE_VERTEX_LOCATION: "us-east5" };
		expect(resolveVertexApiBase(bindings, "google-vertex", "gemini", "gemini-3.6-flash", { project: "customer-project", location: "europe-west4" }))
			.toBe("https://europe-west4-aiplatform.googleapis.com/v1/projects/customer-project/locations/europe-west4");
		expect(resolveVertexApiBase(
			{ ...bindings, GOOGLE_VERTEX_BASE_URL: "https://us-east5-aiplatform.googleapis.com/v1/projects/phaseo-project/locations/us-east5" },
			"google-vertex",
			"gemini",
			"gemini-3.6-flash",
			{ project: "customer-project", location: "global" },
		)).toBe("https://aiplatform.googleapis.com/v1/projects/customer-project/locations/global");
		// Phaseo's own credential serves Gemini from global, where 3.6 Flash is offered.
		expect(resolveVertexApiBase(bindings, "google-vertex", "gemini", "gemini-3.6-flash"))
			.toBe("https://aiplatform.googleapis.com/v1/projects/phaseo-project/locations/global");
	});
});
