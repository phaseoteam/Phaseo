import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateMock = vi.fn();
const getSupabaseAdminMock = vi.fn();
const readGatewayIoLogObjectMock = vi.fn();
const isGatewayIoLoggingFeatureEnabledMock = vi.fn();

vi.mock("@pipeline/before/auth", () => ({
	authenticate: (...args: any[]) => authenticateMock(...args),
}));

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: (...args: any[]) => getSupabaseAdminMock(...args),
}));

vi.mock("@pipeline/audit/io-logging", () => ({
	readGatewayIoLogObject: (...args: any[]) => readGatewayIoLogObjectMock(...args),
}));

vi.mock("@core/feature-flags", () => ({
	isGatewayIoLoggingFeatureEnabled: (...args: any[]) => isGatewayIoLoggingFeatureEnabledMock(...args),
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
	contentsAccess?: "members" | "admins";
	settingsError?: { code?: string; message: string } | null;
	memberRole?: string | null;
	ownerUserId?: string | null;
}) {
	const single = (result: { data: unknown; error: unknown }) => {
		const query: Record<string, unknown> = {};
		query.eq = vi.fn(() => query);
		query.maybeSingle = vi.fn(async () => result);
		return { select: vi.fn(() => query) };
	};
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

			if (table === "workspace_settings") {
				return single({
					data: { io_logging_contents_access: options.contentsAccess ?? "members" },
					error: options.settingsError ?? null,
				});
			}
			if (table === "workspace_members") {
				return single({ data: options.memberRole ? { role: options.memberRole } : null, error: null });
			}
			if (table === "workspaces") {
				return single({ data: { owner_user_id: options.ownerUserId ?? "user_owner" }, error: null });
			}

			throw new Error(`unexpected table: ${table}`);
		}),
	};
}

describe("generationsRoutes", () => {
	beforeEach(() => {
		authenticateMock.mockReset();
		getSupabaseAdminMock.mockReset();
		readGatewayIoLogObjectMock.mockReset();
		isGatewayIoLoggingFeatureEnabledMock.mockReset();
		isGatewayIoLoggingFeatureEnabledMock.mockResolvedValue(true);
		authenticateMock.mockResolvedValue({
			ok: true,
			workspaceId: "ws_test",
			apiKeyId: "key_test",
			apiKeyRef: "key_test",
			apiKeyKid: "kid_test",
			scopes: [],
		});
	});

	it("does not read or expose raw I/O logs to an unscoped API key", async () => {
		const supabase = buildSupabaseMock({
			requestData: { request_id: "gen_123", status_code: 200 },
			ioLogData: {
				io_log_status: "stored",
				io_log_object_key: "private/ws_test/gen_123.json",
			},
		});
		getSupabaseAdminMock.mockReturnValue(supabase);

		const response = await generationsRoutes.request("https://example.com/?id=gen_123");
		const body = await response.json() as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(body.io_log).toBeNull();
		expect(body.replay_request).toBeNull();
		expect(readGatewayIoLogObjectMock).not.toHaveBeenCalled();
		expect(isGatewayIoLoggingFeatureEnabledMock).not.toHaveBeenCalled();
	});

	it("does not expose raw generation payloads to activity-only credentials", async () => {
		authenticateMock.mockResolvedValue({
			ok: true,
			workspaceId: "ws_test",
			apiKeyId: "key_test",
			apiKeyRef: "key_test",
			apiKeyKid: "kid_test",
			scopes: ["activity:read"],
		});
		getSupabaseAdminMock.mockReturnValue(buildSupabaseMock({
			requestData: { request_id: "gen_123", status_code: 200 },
			ioLogData: {
				io_log_status: "stored",
				io_log_object_key: "private/ws_test/gen_123.json",
			},
		}));

		const response = await generationsRoutes.request("https://example.com/?id=gen_123");
		const body = await response.json() as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(body.io_log).toBeNull();
		expect(body.replay_request).toBeNull();
		expect(readGatewayIoLogObjectMock).not.toHaveBeenCalled();
		expect(isGatewayIoLoggingFeatureEnabledMock).not.toHaveBeenCalled();
	});

	it("rejects OAuth sessions without the generation-read capability", async () => {
		authenticateMock.mockResolvedValue({
			ok: true,
			workspaceId: "ws_test",
			apiKeyId: "phaseo_cli",
			apiKeyRef: null,
			apiKeyKid: null,
			authMethod: "oauth",
			oauthScopes: ["activity:read"],
		});

		const response = await generationsRoutes.request("https://example.com/?id=gen_123");

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toEqual({
			error: "insufficient_scope",
			message: "Token requires generations:read",
		});
		expect(getSupabaseAdminMock).not.toHaveBeenCalled();
	});

	it("returns raw I/O logs only with an explicit log-read capability", async () => {
		authenticateMock.mockResolvedValue({
			ok: true,
			workspaceId: "ws_test",
			apiKeyId: "key_test",
			apiKeyRef: "key_test",
			apiKeyKid: "kid_test",
			scopes: ["generations:read"],
		});
		getSupabaseAdminMock.mockReturnValue(buildSupabaseMock({
			requestData: { request_id: "gen_123", status_code: 200 },
			ioLogData: {
				io_log_status: "stored",
				io_log_object_key: "private/ws_test/gen_123.json",
			},
		}));
		readGatewayIoLogObjectMock.mockResolvedValue({
			request_payload: { model: "openai/gpt-5-nano", messages: [{ role: "user", content: "hello" }] },
			gateway_response: { output_text: "hi" },
		});

		const response = await generationsRoutes.request("https://example.com/?id=gen_123");
		const body = await response.json() as any;

		expect(response.status).toBe(200);
		expect(body.replay_supported).toBe(true);
		expect(body.io_log.payload.gateway_response.output_text).toBe("hi");
		expect(readGatewayIoLogObjectMock).toHaveBeenCalledWith("private/ws_test/gen_123.json");
	});

	describe("when contents are limited to owners and admins", () => {
		const storedLog = {
			requestData: { request_id: "gen_123", status_code: 200 },
			ioLogData: { io_log_status: "stored", io_log_object_key: "private/ws_test/gen_123.json" },
			contentsAccess: "admins" as const,
		};

		beforeEach(() => {
			readGatewayIoLogObjectMock.mockResolvedValue({ request_payload: { model: "m" }, gateway_response: { output_text: "hi" } });
		});

		function authAs(userId: string | null) {
			authenticateMock.mockResolvedValue({
				ok: true,
				workspaceId: "ws_test",
				apiKeyId: "key_test",
				apiKeyRef: "key_test",
				apiKeyKid: "kid_test",
				scopes: ["generations:read"],
				userId,
			});
		}

		it("hides contents from keys created by members", async () => {
			authAs("user_member");
			getSupabaseAdminMock.mockReturnValue(buildSupabaseMock({ ...storedLog, memberRole: "member" }));

			const body = await (await generationsRoutes.request("https://example.com/?id=gen_123")).json() as any;

			expect(body.io_log.status).toBe("restricted");
			expect(body.io_log.payload).toBeNull();
			expect(body.replay_request).toBeNull();
			expect(readGatewayIoLogObjectMock).not.toHaveBeenCalled();
		});

		it("hides contents from keys with no creator", async () => {
			authAs(null);
			getSupabaseAdminMock.mockReturnValue(buildSupabaseMock(storedLog));

			const body = await (await generationsRoutes.request("https://example.com/?id=gen_123")).json() as any;

			expect(body.io_log.status).toBe("restricted");
			expect(readGatewayIoLogObjectMock).not.toHaveBeenCalled();
		});

		it("returns contents to keys created by admins and the owner", async () => {
			authAs("user_admin");
			getSupabaseAdminMock.mockReturnValue(buildSupabaseMock({ ...storedLog, memberRole: "admin" }));
			const admin = await (await generationsRoutes.request("https://example.com/?id=gen_123")).json() as any;
			expect(admin.io_log.payload.gateway_response.output_text).toBe("hi");

			authAs("user_owner");
			getSupabaseAdminMock.mockReturnValue(buildSupabaseMock({ ...storedLog, ownerUserId: "user_owner" }));
			const owner = await (await generationsRoutes.request("https://example.com/?id=gen_123")).json() as any;
			expect(owner.io_log.status).toBe("stored");
			expect(owner.io_log.payload.gateway_response.output_text).toBe("hi");
		});

		it("hides contents when the setting can't be read", async () => {
			authAs("user_admin");
			getSupabaseAdminMock.mockReturnValue(buildSupabaseMock({
				...storedLog,
				memberRole: "admin",
				settingsError: { code: "57014", message: "canceling statement due to statement timeout" },
			}));

			const body = await (await generationsRoutes.request("https://example.com/?id=gen_123")).json() as any;

			expect(body.io_log.status).toBe("restricted");
			expect(readGatewayIoLogObjectMock).not.toHaveBeenCalled();
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
