import {
	extractResendRecipient,
	hashRecipientEmail,
	normalizeRecipientEmail,
	resendSuppressionReason,
} from "./resend-webhooks";

describe("Resend webhook helpers", () => {
	it("normalizes and hashes recipients deterministically", async () => {
		expect(normalizeRecipientEmail(" Daniel@Example.com ")).toBe("daniel@example.com");
		expect(await hashRecipientEmail("Daniel@Example.com")).toBe(
			await hashRecipientEmail(" daniel@example.com "),
		);
	});

	it("extracts the first valid recipient without retaining the payload", () => {
		expect(extractResendRecipient({ data: { to: ["", " User@Example.com "] } })).toBe(
			"user@example.com",
		);
	});

	it("classifies only terminal delivery suppression events", () => {
		expect(resendSuppressionReason("email.bounced")).toBe("bounced");
		expect(resendSuppressionReason("email.complained")).toBe("complained");
		expect(resendSuppressionReason("email.suppressed")).toBe("suppressed");
		expect(resendSuppressionReason("email.delivered")).toBeNull();
	});
});
