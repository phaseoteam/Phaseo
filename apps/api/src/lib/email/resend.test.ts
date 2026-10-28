import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	bindings: { RESEND_API_KEY: "resend_key" } as Record<string, string | undefined>,
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => state.bindings,
}));

const { isResendContactUnsubscribed } = await import("./resend");

describe("isResendContactUnsubscribed", () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		state.bindings = { RESEND_API_KEY: "resend_key" };
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("looks the contact up by normalised email and returns its unsubscribed flag", async () => {
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ object: "contact", unsubscribed: true }), { status: 200 }));
		await expect(isResendContactUnsubscribed(" Ada+x@Example.com ")).resolves.toBe(true);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.resend.com/contacts/ada%2Bx%40example.com",
			expect.objectContaining({ headers: { Authorization: "Bearer resend_key" } }),
		);

		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ object: "contact", unsubscribed: false }), { status: 200 }));
		await expect(isResendContactUnsubscribed("ada@example.com")).resolves.toBe(false);
	});

	it("treats a missing contact as subscribed", async () => {
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ name: "not_found" }), { status: 404 }));
		await expect(isResendContactUnsubscribed("ada@example.com")).resolves.toBe(false);
	});

	it("fails closed on errors and unexpected responses", async () => {
		fetchMock.mockResolvedValueOnce(new Response("slow down", { status: 429 }));
		await expect(isResendContactUnsubscribed("ada@example.com")).rejects.toThrow("resend_contact_lookup_error:429");

		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ object: "contact" }), { status: 200 }));
		await expect(isResendContactUnsubscribed("ada@example.com")).rejects.toThrow("resend_contact_lookup_error:invalid_response");

		state.bindings = {};
		await expect(isResendContactUnsubscribed("ada@example.com")).rejects.toThrow("missing_resend_api_key");
	});
});
