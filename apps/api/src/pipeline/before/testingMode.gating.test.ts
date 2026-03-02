import { beforeEach, describe, expect, it, vi } from "vitest";

const getBindingsMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: () => getBindingsMock(),
	getSupabaseAdmin: vi.fn(),
}));

import { resolveTestingMode } from "./testingMode";

describe("resolveTestingMode gating", () => {
	beforeEach(() => {
		getBindingsMock.mockReset();
		getBindingsMock.mockReturnValue({});
	});

	it("returns not_requested when testing mode not requested", async () => {
		const result = await resolveTestingMode({
			requested: false,
			teamId: "team_1",
			userId: null,
			internal: false,
		});
		expect(result).toEqual({ enabled: false, reason: "not_requested" });
	});

	it("requires internal token in development for non-internal requests", async () => {
		getBindingsMock.mockReturnValue({ NODE_ENV: "development" });
		const result = await resolveTestingMode({
			requested: true,
			teamId: "team_1",
			userId: "user_1",
			internal: false,
		});
		expect(result).toEqual({ enabled: false, reason: "requires_internal_token" });
	});

	it("requires internal token in production for non-internal requests", async () => {
		getBindingsMock.mockReturnValue({ NODE_ENV: "production" });
		const result = await resolveTestingMode({
			requested: true,
			teamId: "team_1",
			userId: "user_1",
			internal: false,
		});
		expect(result).toEqual({ enabled: false, reason: "requires_internal_token" });
	});

	it("allows testing mode in production for internal requests", async () => {
		getBindingsMock.mockReturnValue({ NODE_ENV: "production" });
		const result = await resolveTestingMode({
			requested: true,
			teamId: "team_1",
			userId: null,
			internal: true,
		});
		expect(result).toEqual({ enabled: true, reason: "internal" });
	});
});
