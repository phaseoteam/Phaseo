import { beforeEach, describe, expect, it, vi } from "vitest";

const guardAuthMock = vi.fn();
const fetchCatalogueMock = vi.fn();

vi.mock("@/pipeline/before/guards", () => ({
	guardAuth: (...args: any[]) => guardAuthMock(...args),
}));

vi.mock("./models.catalogue", () => ({
	fetchCatalogue: (...args: any[]) => fetchCatalogueMock(...args),
}));

vi.mock("../../utils", () => ({
	withRuntime:
		(handler: (req: Request) => Promise<Response>) =>
		async (c: { req: { raw: Request } }) =>
			handler(c.req.raw),
	json: (data: unknown, status = 200, headers: Record<string, string> = {}) =>
		new Response(JSON.stringify(data), {
			status,
			headers: {
				"Content-Type": "application/json",
				...headers,
			},
		}),
	cacheHeaders: () => ({ "Cache-Control": "private, max-age=1800, stale-while-revalidate=1800" }),
}));

import { placeholdersRoutes } from "./placeholders";

describe("placeholdersRoutes /endpoints", () => {
	beforeEach(() => {
		guardAuthMock.mockReset();
		fetchCatalogueMock.mockReset();
		guardAuthMock.mockResolvedValue({
			ok: true,
			value: {
				workspaceId: "ws_test",
			},
		});
	});

	it("returns catalogue-backed endpoint ids and sample models", async () => {
		fetchCatalogueMock.mockResolvedValue([
			{
				model_id: "openai/gpt-5-nano",
				endpoints: ["responses", "chat/completions"],
				providers: [
					{ api_provider_id: "openai", endpoints: ["responses", "chat/completions"] },
				],
			},
			{
				model_id: "anthropic/claude-sonnet-4",
				endpoints: ["messages"],
				providers: [
					{ api_provider_id: "anthropic", endpoints: ["messages"] },
				],
			},
		]);

		const response = await placeholdersRoutes.request("https://example.com/endpoints");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			endpoints: [
				"chat/completions",
				"messages",
				"responses",
			],
			data: [
				{
					id: "chat/completions",
					capability_id: "chat/completions",
					public_path: "/v1/chat/completions",
					collection: "text",
					model_count: 1,
					provider_count: 1,
				},
				{
					id: "messages",
					capability_id: "messages",
					public_path: "/v1/messages",
					collection: "text",
					model_count: 1,
					provider_count: 1,
				},
				{
					id: "responses",
					capability_id: "responses",
					public_path: "/v1/responses",
					collection: "text",
					model_count: 1,
					provider_count: 1,
				},
			],
			sample_models: [
				"openai/gpt-5-nano",
				"anthropic/claude-sonnet-4",
			],
		});
	});

	it("surfaces backend lookup failures as a 500 payload", async () => {
		fetchCatalogueMock.mockRejectedValue(new Error("db unavailable"));

		const response = await placeholdersRoutes.request("https://example.com/endpoints");

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			ok: false,
			error: "failed",
			message: "db unavailable",
		});
	});
});
