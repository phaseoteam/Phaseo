import { beforeEach, describe, expect, it, vi } from "vitest";

const getBindingsMock = vi.fn();
const getSupabaseAdminMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: () => getBindingsMock(),
	getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { resolveTestingMode } from "./testingMode";

function buildSupabaseForRole(role: string | null, error: any = null) {
	const maybeSingle = vi.fn().mockResolvedValue({
		data: role ? { role } : null,
		error,
	});
	const eq = vi.fn().mockReturnValue({ maybeSingle });
	const select = vi.fn().mockReturnValue({ eq });
	const from = vi.fn().mockReturnValue({ select });
	return { from, select, eq, maybeSingle };
}

describe("resolveTestingMode gating", () => {
	beforeEach(() => {
		getBindingsMock.mockReset();
		getSupabaseAdminMock.mockReset();
		getBindingsMock.mockReturnValue({});
	});

	it("allows local override when enabled", async () => {
		getBindingsMock.mockReturnValue({ GATEWAY_LOCAL_TESTING_MODE: "true" });
		const result = await resolveTestingMode({
			requested: true,
			teamId: "team_1",
			userId: null,
			internal: false,
		});
		expect(result).toEqual({ enabled: true, reason: "local_override" });
	});

	it("allows platform admin users", async () => {
		getSupabaseAdminMock.mockReturnValue(buildSupabaseForRole("admin"));
		const result = await resolveTestingMode({
			requested: true,
			teamId: "team_1",
			userId: "user_1",
			internal: false,
		});
		expect(result).toEqual({ enabled: true, reason: "platform_admin" });
	});

	it("disables testing mode in production for non-internal requests", async () => {
		getBindingsMock.mockReturnValue({ NODE_ENV: "production" });
		getSupabaseAdminMock.mockReturnValue(buildSupabaseForRole("admin"));
		const result = await resolveTestingMode({
			requested: true,
			teamId: "team_1",
			userId: "user_1",
			internal: false,
		});
		expect(result).toEqual({ enabled: false, reason: "disabled_outside_development" });
	});

	it("disables testing mode in production for internal requests", async () => {
		getBindingsMock.mockReturnValue({ NODE_ENV: "production" });
		const result = await resolveTestingMode({
			requested: true,
			teamId: "team_1",
			userId: null,
			internal: true,
		});
		expect(result).toEqual({ enabled: false, reason: "disabled_outside_development" });
	});

	it("rejects non-admin users", async () => {
		getSupabaseAdminMock.mockReturnValue(buildSupabaseForRole("user"));
		const result = await resolveTestingMode({
			requested: true,
			teamId: "team_1",
			userId: "user_2",
			internal: false,
		});
		expect(result).toEqual({
			enabled: false,
			reason: "requires_platform_admin_or_local_override",
		});
	});
});
