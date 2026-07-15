import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateMock = vi.fn();
const getSupabaseAdminMock = vi.fn();

vi.mock("@pipeline/before/auth", () => ({
	authenticate: (...args: any[]) => authenticateMock(...args),
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

import { generationsRoutes } from "./generations";

function buildSupabaseMock(options: {
	requestData?: Record<string, unknown> | null;
	requestError?: { message: string } | null;
	ioLogData?: Record<string, unknown> | null;
	ioLogError?: { message: string } | null;
}) {
	return {
		from: vi.fn((table: string) => {
			if (table === "gateway_requests") {
				return {
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							eq: vi.fn(() => ({
								maybeSingle: vi.fn(async () => ({
									data: options.requestData ?? null,
									error: options.requestError ?? null,
								})),
							})),
						})),
					})),
				};
			}

			if (table === "gateway_io_logs") {
				return {
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							eq: vi.fn(() => ({
								maybeSingle: vi.fn(async () => ({
									data: options.ioLogData ?? null,
									error: options.ioLogError ?? null,
								})),
							})),
						})),
					})),
				};
			}

			throw new Error(`unexpected table: ${table}`);
		}),
	};
}

describe("generationsRoutes", () => {
	beforeEach(() => {
		authenticateMock.mockReset();
		getSupabaseAdminMock.mockReset();
		authenticateMock.mockResolvedValue({
			ok: true,
			workspaceId: "ws_test",
		});
	});

	it("does not expose replay data when no R2 I/O object exists", async () => {
		getSupabaseAdminMock.mockReturnValue(
			buildSupabaseMock({
				requestData: {
					request_id: "gen_123",
					endpoint: "chat/completions",
					model_id: "openai/gpt-5-nano",
					success: true,
					status_code: 200,
				},
			ioLogData: null,
			}),
		);

		const response = await generationsRoutes.request("https://example.com/?id=gen_123");

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual(
			expect.objectContaining({
				request_id: "gen_123",
				replay_supported: false,
				replay_request: null,
			}),
		);
	});

	it("returns replay_supported=false for older rows without stored payloads", async () => {
		getSupabaseAdminMock.mockReturnValue(
			buildSupabaseMock({
				requestData: {
					request_id: "gen_legacy",
					endpoint: "responses",
					model_id: "openai/gpt-5.4-nano",
					success: false,
					status_code: 500,
				},
			ioLogData: null,
			}),
		);

		const response = await generationsRoutes.request("https://example.com/?id=gen_legacy");

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual(
			expect.objectContaining({
				request_id: "gen_legacy",
				replay_supported: false,
				replay_request: null,
			}),
		);
	});

	it("returns 401 when authentication fails", async () => {
		authenticateMock.mockResolvedValue({
			ok: false,
			reason: "missing",
		});

		const response = await generationsRoutes.request("https://example.com/?id=gen_123");

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({
			ok: false,
			error: "unauthorised",
			reason: "missing",
		});
	});
});
