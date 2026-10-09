import { beforeEach, describe, expect, it, vi } from "vitest";

const getBindingsMock = vi.fn();
const roleLookupMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: () => getBindingsMock(),
	getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: roleLookupMock }) }) }) }),
}));

import { isTestingModeRequested, resolveTestingMode } from "./testingMode";

describe("isTestingModeRequested", () => {
	beforeEach(() => {
		getBindingsMock.mockReset();
		roleLookupMock.mockReset();
		roleLookupMock.mockResolvedValue({ data: { role: "admin" }, error: null });
		getBindingsMock.mockReturnValue({});
	});

	it("enables testing mode from header", () => {
		const req = new Request("https://gateway.local/v1/chat/completions", {
			method: "POST",
			headers: {
				"x-aistats-testing-mode": "true",
			},
			body: JSON.stringify({ model: "openai/gpt-4o-mini" }),
		});
		expect(isTestingModeRequested(req, { model: "openai/gpt-4o-mini" })).toBe(true);
	});

	it("enables testing mode from request body flag", () => {
		const req = new Request("https://gateway.local/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({ model: "openai/gpt-4o-mini" }),
		});
		expect(isTestingModeRequested(req, { testing_mode: true })).toBe(true);
		expect(isTestingModeRequested(req, { debug: { testingMode: "yes" } })).toBe(true);
	});

	it("keeps testing mode disabled by default", () => {
		const req = new Request("https://gateway.local/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({ model: "openai/gpt-4o-mini" }),
		});
		expect(isTestingModeRequested(req, { model: "openai/gpt-4o-mini" })).toBe(false);
	});

	it("does not auto-enable from local override env flag", () => {
		getBindingsMock.mockReturnValue({ GATEWAY_LOCAL_TESTING_MODE: "true" });
		const req = new Request("https://gateway.local/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({ model: "openai/gpt-4o-mini" }),
		});
		expect(isTestingModeRequested(req, { model: "openai/gpt-4o-mini" })).toBe(false);
	});

	it("still reads explicit testing header when local override is set", () => {
		getBindingsMock.mockReturnValue({
			GATEWAY_LOCAL_TESTING_MODE: "true",
		});
		const req = new Request("https://gateway.local/v1/chat/completions", {
			method: "POST",
			headers: {
				"x-aistats-testing-mode": "true",
			},
			body: JSON.stringify({ model: "openai/gpt-4o-mini" }),
		});
		expect(isTestingModeRequested(req, { model: "openai/gpt-4o-mini" })).toBe(true);
	});

	it("does not grant testing access from the public flag alone", async () => {
		await expect(resolveTestingMode({
			requested: true,
			workspaceId: "workspace-public",
			internal: false,
		})).resolves.toEqual({
			enabled: false,
			reason: "requires_internal_token",
		});
	});

	it("grants testing access only after internal authentication", async () => {
		await expect(resolveTestingMode({
			requested: true,
			workspaceId: "workspace-internal",
			userId: "admin-user",
			internal: true,
		})).resolves.toEqual({
			enabled: true,
			reason: "internal",
		});
	});
});
