import { beforeEach, describe, expect, it, vi } from "vitest";

const guardAuthMock = vi.fn();
const getSupabaseAdminMock = vi.fn();

vi.mock("@/pipeline/before/guards", () => ({
	guardAuth: (...args: any[]) => guardAuthMock(...args),
}));

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: (...args: any[]) => getSupabaseAdminMock(...args),
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
}));

import { placeholdersRoutes } from "./placeholders";

describe("placeholdersRoutes /endpoints", () => {
	beforeEach(() => {
		guardAuthMock.mockReset();
		getSupabaseAdminMock.mockReset();
		guardAuthMock.mockResolvedValue({
			ok: true,
			value: {
				workspaceId: "ws_test",
			},
		});
	});

	it("returns endpoint ids and sample models", async () => {
		getSupabaseAdminMock.mockReturnValue({
			from: vi.fn(() => ({
				select: vi.fn(() => ({
					eq: vi.fn(() => ({
						order: vi.fn(() => ({
							limit: vi.fn(async () => ({
								data: [
									{ model_id: "openai/gpt-5-nano" },
									{ model_id: "anthropic/claude-sonnet-4" },
									{ model_id: null },
								],
								error: null,
							})),
						})),
					})),
				})),
			})),
		});

		const response = await placeholdersRoutes.request("https://example.com/endpoints");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			endpoints: [
				"chat/completions",
				"responses",
				"messages",
				"embeddings",
				"moderations",
				"audio/speech",
				"audio/transcriptions",
				"audio/translations",
				"images/generations",
				"images/edits",
				"videos",
				"ocr",
				"music/generate",
				"batches",
				"files",
			],
			sample_models: [
				"openai/gpt-5-nano",
				"anthropic/claude-sonnet-4",
			],
		});
	});

	it("surfaces backend lookup failures as a 500 payload", async () => {
		getSupabaseAdminMock.mockReturnValue({
			from: vi.fn(() => ({
				select: vi.fn(() => ({
					eq: vi.fn(() => ({
						order: vi.fn(() => ({
							limit: vi.fn(async () => ({
								data: null,
								error: { message: "db unavailable" },
							})),
						})),
					})),
				})),
			})),
		});

		const response = await placeholdersRoutes.request("https://example.com/endpoints");

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			ok: false,
			error: "failed",
			message: "db unavailable",
		});
	});
});
