import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteResendContact, unsubscribeResendContact } from "./resendContacts";

const removeContact = vi.hoisted(() => vi.fn());
const updateContact = vi.hoisted(() => vi.fn());
const createContact = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
	Resend: class MockResend {
		contacts = { remove: removeContact, update: updateContact, create: createContact };
	},
}));

describe("Resend contact cleanup", () => {
	beforeEach(() => {
		removeContact.mockReset();
		removeContact.mockResolvedValue({ data: { deleted: true }, error: null });
	});

	it("deletes the normalized contact before account removal", async () => {
		await deleteResendContact({ ENV: "production", RESEND_API_KEY: "re_test" }, " User@Example.com ");
		expect(removeContact).toHaveBeenCalledWith({ email: "user@example.com" });
	});

	it("treats an already absent contact as deleted", async () => {
		removeContact.mockResolvedValue({
			data: null,
			error: { name: "not_found", message: "Contact not found", statusCode: 404 },
		});
		await expect(deleteResendContact(
			{ ENV: "production", RESEND_API_KEY: "re_test" },
			"user@example.com",
		)).resolves.toBeUndefined();
	});

	it("does not acknowledge production cleanup without a configured key", async () => {
		await expect(unsubscribeResendContact({ ENV: "production" }, "user@example.com")).rejects.toThrow("missing_resend_api_key");
		await expect(unsubscribeResendContact({ ENV: "development" }, "user@example.com")).resolves.toBeUndefined();
		await expect(deleteResendContact(
			{ ENV: "production" },
			"user@example.com",
		)).rejects.toThrow("missing_resend_api_key");
	});
});

describe("Resend unsubscribe", () => {
	const env = { ENV: "production", RESEND_API_KEY: "re_test" };
	const notFound = { data: null, error: { name: "not_found", message: "Contact not found", statusCode: 404 } };

	beforeEach(() => {
		updateContact.mockReset().mockResolvedValue({ data: { id: "c_1" }, error: null });
		createContact.mockReset().mockResolvedValue({ data: { id: "c_2" }, error: null });
	});

	it("marks an existing contact unsubscribed", async () => {
		await unsubscribeResendContact(env, " User@Example.com ");
		expect(updateContact).toHaveBeenCalledWith({ email: "user@example.com", unsubscribed: true });
		expect(createContact).not.toHaveBeenCalled();
	});

	it("creates an unsubscribed contact when there is none", async () => {
		updateContact.mockResolvedValueOnce(notFound);
		await unsubscribeResendContact(env, "user@example.com");
		expect(createContact).toHaveBeenCalledWith({ email: "user@example.com", unsubscribed: true });
	});

	it("marks a contact created concurrently", async () => {
		updateContact.mockResolvedValueOnce(notFound);
		createContact.mockResolvedValueOnce({ data: null, error: { name: "conflict", message: "exists", statusCode: 409 } });
		await unsubscribeResendContact(env, "user@example.com");
		expect(updateContact).toHaveBeenCalledTimes(2);
	});

	it("surfaces other Resend errors", async () => {
		updateContact.mockResolvedValueOnce({ data: null, error: { name: "rate_limit_exceeded", message: "slow down", statusCode: 429 } });
		await expect(unsubscribeResendContact(env, "user@example.com")).rejects.toThrow("resend_contact_unsubscribe_failed:rate_limit_exceeded");
	});
});
