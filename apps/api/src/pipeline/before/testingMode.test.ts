import { beforeEach, describe, expect, it, vi } from "vitest";

const getBindingsMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: () => getBindingsMock(),
	getSupabaseAdmin: vi.fn(),
}));

import { isTestingModeRequested } from "./testingMode";

describe("isTestingModeRequested", () => {
	beforeEach(() => {
		getBindingsMock.mockReset();
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
});
