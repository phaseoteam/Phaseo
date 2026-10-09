import { beforeEach, describe, expect, it, vi } from "vitest";

const getBindingsMock = vi.fn();
const roleLookupMock = vi.fn();
const routeLookupMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: () => getBindingsMock(),
	getSupabaseAdmin: () => ({ from: (table: string) => table === "users"
		? { select: () => ({ eq: () => ({ maybeSingle: roleLookupMock }) }) }
		: { select: () => ({ eq: () => ({ eq: () => ({ in: () => ({ limit: () => ({ maybeSingle: routeLookupMock }) }) }) }) }) } }),
}));

import { isPerfGatewayEndpointAllowed, resolvePerfGatewayAccess, resolveTestingMode } from "./testingMode";

describe("resolveTestingMode gating", () => {
	it.each([null, "member-user"])("denies internal inference for non-admin identity %s", async (userId) => {
		roleLookupMock.mockResolvedValue({ data: { role: "user" }, error: null });
		expect(await resolveTestingMode({ requested: true, workspaceId: "team_1", userId, internal: true }))
			.toEqual({ enabled: false, reason: "requires_admin" });
	});
	it("fails closed when role lookup fails", async () => {
		roleLookupMock.mockRejectedValue(new Error("unavailable"));
		expect(await resolveTestingMode({ requested: true, workspaceId: "team_1", userId: "admin-user", internal: true }))
			.toEqual({ enabled: false, reason: "requires_admin" });
	});
	beforeEach(() => {
		getBindingsMock.mockReset();
		roleLookupMock.mockReset();
		routeLookupMock.mockReset();
		routeLookupMock.mockResolvedValue({ data: { provider_model_id: "test-route" }, error: null });
		roleLookupMock.mockResolvedValue({ data: { role: "admin" }, error: null });
		getBindingsMock.mockReturnValue({});
	});

	it("returns not_requested when testing mode not requested", async () => {
		const result = await resolveTestingMode({
			requested: false,
			workspaceId: "team_1",
			userId: null,
			internal: false,
		});
		expect(result).toEqual({ enabled: false, reason: "not_requested" });
	});

	it("requires internal token in development for non-internal requests", async () => {
		roleLookupMock.mockResolvedValue({ data: { role: "user" }, error: null });
		getBindingsMock.mockReturnValue({ NODE_ENV: "development" });
		const result = await resolveTestingMode({
			requested: true,
			workspaceId: "team_1",
			userId: "user_1",
			internal: false,
		});
		expect(result).toEqual({ enabled: false, reason: "requires_internal_token" });
	});

	it("requires internal token in production for non-internal requests", async () => {
		roleLookupMock.mockResolvedValue({ data: { role: "user" }, error: null });
		getBindingsMock.mockReturnValue({ NODE_ENV: "production" });
		const result = await resolveTestingMode({
			requested: true,
			workspaceId: "team_1",
			userId: "user_1",
			internal: false,
		});
		expect(result).toEqual({ enabled: false, reason: "requires_internal_token" });
	});

	it("allows testing mode in production for internal requests", async () => {
		getBindingsMock.mockReturnValue({ NODE_ENV: "production" });
		const result = await resolveTestingMode({
			requested: true,
			workspaceId: "team_1",
			userId: "admin-user",
			internal: true,
		});
		expect(result).toEqual({ enabled: true, reason: "internal" });
	});

	it("automatically allows an admin's ordinary request to an internal route", async () => {
		expect(await resolveTestingMode({ requested: false, workspaceId: "team_1", userId: "admin-user", model: "test/internal", internal: false }))
			.toEqual({ enabled: true, reason: "admin" });
	});
	it.each([null, "member-user"])("does not automatically grant internal access to %s", async (userId) => {
		roleLookupMock.mockResolvedValue({ data: { role: "user" }, error: null });
		expect(await resolveTestingMode({ requested: false, workspaceId: "team_1", userId, model: "test/internal" })).toEqual({ enabled: false, reason: "not_requested" });
		expect(routeLookupMock).not.toHaveBeenCalled();
	});
	it("keeps ordinary admin requests on public routing when no internal route exists", async () => {
		routeLookupMock.mockResolvedValue({ data: null, error: null });
		expect(await resolveTestingMode({ requested: false, workspaceId: "team_1", userId: "admin-user", model: "test/public" })).toEqual({ enabled: false, reason: "not_requested" });
	});
	it("fails closed for automatic access on role and route lookup errors", async () => {
		roleLookupMock.mockResolvedValueOnce({ data: { role: "admin" }, error: new Error("unavailable") });
		const args = { requested: false, workspaceId: "team_1", userId: "admin-user", model: "test/internal" };
		expect(await resolveTestingMode(args)).toEqual({ enabled: false, reason: "not_requested" });
		routeLookupMock.mockRejectedValueOnce(new Error("unavailable"));
		expect(await resolveTestingMode(args)).toEqual({ enabled: false, reason: "not_requested" });
	});
	it("allows a verified admin's explicit testing request without an internal token", async () => {
		expect(await resolveTestingMode({ requested: true, workspaceId: "team_1", userId: "admin-user", model: "test/internal", internal: false })).toEqual({ enabled: true, reason: "admin" });
	});
});

describe("resolvePerfGatewayAccess", () => {
	it("does not constrain non-perf deployments", () => {
		expect(resolvePerfGatewayAccess({
			environment: "prod",
			allowedWorkspaceId: null,
			workspaceId: "team_customer",
		})).toEqual({
			perfEnvironment: false,
			allowed: true,
			reason: "not_perf_environment",
		});
	});

	it("fails closed when a perf workspace is not configured", () => {
		expect(resolvePerfGatewayAccess({
			environment: "perf",
			allowedWorkspaceId: null,
			workspaceId: "team_perf",
		}).reason).toBe("perf_workspace_not_configured");
	});

	it("only allows the configured workspace in perf", () => {
		expect(resolvePerfGatewayAccess({
			environment: "perf",
			allowedWorkspaceId: "team_perf",
			workspaceId: "team_customer",
		}).allowed).toBe(false);
		expect(resolvePerfGatewayAccess({
			environment: "perf",
			allowedWorkspaceId: "team_perf",
			workspaceId: "team_perf",
		}).allowed).toBe(true);
	});
});

describe("isPerfGatewayEndpointAllowed", () => {
	it("fails closed in perf and permits configured text endpoints", () => {
		expect(isPerfGatewayEndpointAllowed({
			perfEnvironment: true,
			allowedEndpoints: null,
			endpoint: "responses",
		})).toBe(false);
		expect(isPerfGatewayEndpointAllowed({
			perfEnvironment: true,
			allowedEndpoints: "chat.completions,responses,messages",
			endpoint: "responses",
		})).toBe(true);
		expect(isPerfGatewayEndpointAllowed({
			perfEnvironment: true,
			allowedEndpoints: "chat.completions,responses,messages",
			endpoint: "video.generation",
		})).toBe(false);
	});
});
