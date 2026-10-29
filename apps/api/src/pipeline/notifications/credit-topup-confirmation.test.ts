import { describe, expect, it } from "vitest";
import { renderCreditTopupConfirmationEmail } from "./credit-topup-confirmation";

describe("credit top-up confirmation email", () => {
	const payload = {
		workspace_name: "Acme <Labs>",
		amount_cents: 5000,
		card_brand: "visa",
		card_last4: "4242",
		requested_by_email: "dev@acme.test",
		confirm_url: "https://phaseo.app/settings/credits/topups/00000000-0000-4000-8000-0000000000aa?token=abc&x=1",
		expires_at: "2026-10-28T15:30:00.000Z",
	};

	it("names the amount, card, workspace, requester and expiry", () => {
		const email = renderCreditTopupConfirmationEmail(payload);
		expect(email.subject).toBe("Confirm $50.00 of Phaseo credits");
		expect(email.text).toContain("dev@acme.test asked, through the Phaseo CLI or API, to add $50.00 of credits to Acme <Labs> and charge Visa ending 4242.");
		expect(email.text).toContain("before 15:30 UTC");
		expect(email.text).toContain(`Review request: ${payload.confirm_url}`);
		expect(email.text).toContain("Nothing is charged until an owner or admin confirms it.");
	});

	it("escapes HTML and links to the review page, not to an action", () => {
		const email = renderCreditTopupConfirmationEmail(payload);
		expect(email.html).toContain("Acme &lt;Labs&gt;");
		expect(email.html).not.toContain("Acme <Labs>");
		expect(email.html).toContain('href="https://phaseo.app/settings/credits/topups/00000000-0000-4000-8000-0000000000aa?token=abc&amp;x=1"');
		expect(email.html).not.toMatch(/\/(confirm|decline)\b/);
	});

	it("falls back when the requester is a management key", () => {
		const email = renderCreditTopupConfirmationEmail({ ...payload, requested_by_email: null, card_brand: null, card_last4: null });
		expect(email.text).toContain("Someone asked");
		expect(email.text).toContain("charge the saved card");
	});
});
