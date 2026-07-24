import { beforeEach, describe, expect, it, vi } from "vitest";

const getBindingsMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: () => getBindingsMock(),
	getSupabaseAdmin: vi.fn(),
}));

import { isPerfGatewayEndpointAllowed, resolvePerfGatewayAccess, resolveTestingMode } from "./testingMode";

describe("resolveTestingMode gating", () => {
	beforeEach(() => {
		getBindingsMock.mockReset();
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
			userId: null,
			internal: true,
		});
		expect(result).toEqual({ enabled: true, reason: "internal" });
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
