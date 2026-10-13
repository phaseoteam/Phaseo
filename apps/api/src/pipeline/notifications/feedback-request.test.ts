import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	bindings: {} as Record<string, string | undefined>,
	rpc: vi.fn(),
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => state.bindings,
	getSupabaseAdmin: () => ({ rpc: state.rpc }),
}));

const { enqueueFeedbackRequestEmails, renderFeedbackRequestEmail } = await import("./feedback-request");

const token = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("feedback request email", () => {
	beforeEach(() => {
		state.bindings = { FEEDBACK_REQUEST_FROM_EMAIL: "Daniel Butler <daniel@phaseo.app>" };
		state.rpc.mockReset();
	});

	it("is sent from Daniel with one-click unsubscribe headers", () => {
		const email = renderFeedbackRequestEmail({ token, segment: "used_not_paid", recency: "lapsed", first_name: "Ada" });
		expect(email.from).toBe("Daniel Butler <daniel@phaseo.app>");
		expect(email.replyTo).toBe("Daniel Butler <daniel@phaseo.app>");
		expect(email.headers).toEqual({
			"List-Unsubscribe": `<https://phaseo.app/api/_web/feedback/${token}/unsubscribe>`,
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		});
		expect(email.subject).toBe("Quick question about Phaseo");
		expect(email.text).toContain("Hi Ada,");
		expect(email.text).toContain("You haven't been on Phaseo for a while");
		expect(email.text).toContain("why you didn't end up adding credits");
		expect(email.text).toContain(`https://phaseo.app/feedback/${token}`);
		expect(email.text).toContain(`Unsubscribe: https://phaseo.app/feedback/${token}/unsubscribe`);
		expect(email.text).toContain("$1 of Phaseo credit");
		expect(email.html).toContain(`href="https://phaseo.app/feedback/${token}"`);
	});

	it("picks the question by segment and the opening by recency", () => {
		const paid = renderFeedbackRequestEmail({ token, segment: "paid", recency: "active" });
		expect(paid.subject).toBe("Can I ask what you think of Phaseo?");
		expect(paid.text).toContain("Hi there,");
		expect(paid.text).toContain("Thanks for using Phaseo recently.");
		expect(paid.text).toContain("what you like, what annoys you");

		const dormant = renderFeedbackRequestEmail({ token, segment: "never_requested", recency: "dormant" });
		expect(dormant.text).toContain("you may know us as AI Stats");
		expect(dormant.text).toContain("what stopped you getting started");
	});

	it("escapes names, honours the reward setting and base URL", () => {
		state.bindings = {
			...state.bindings,
			FEEDBACK_REQUEST_REPLY_TO_EMAIL: "daniel@phaseo.app",
			FEEDBACK_REWARD_USD: "0",
			PHASEO_WEB_BASE_URL: "https://staging.phaseo.app/",
		};
		const email = renderFeedbackRequestEmail({ token, segment: "paid", recency: "active", first_name: "<b>Eve</b>" });
		expect(email.html).toContain("Hi &lt;b&gt;Eve&lt;/b&gt;,");
		expect(email.html).not.toContain("<b>Eve</b>");
		expect(email.text).not.toContain("credit for answering");
		expect(email.replyTo).toBe("daniel@phaseo.app");
		expect(email.text).toContain(`https://staging.phaseo.app/feedback/${token}`);
	});

	it("refuses to render without a real sender or a valid token", () => {
		state.bindings = {};
		expect(() => renderFeedbackRequestEmail({ token, segment: "paid", recency: "active" })).toThrow("missing_feedback_request_from_email");
		state.bindings = { FEEDBACK_REQUEST_FROM_EMAIL: "daniel@phaseo.app" };
		expect(() => renderFeedbackRequestEmail({ token: "nope", segment: "paid", recency: "active" })).toThrow("invalid_feedback_request_token");
	});

	it("queues the day's requests through the database with the configured limit", async () => {
		state.rpc.mockResolvedValueOnce({ data: 7, error: null });
		await expect(enqueueFeedbackRequestEmails()).resolves.toBe(7);
		expect(state.rpc).toHaveBeenCalledWith("enqueue_feedback_request_emails", {
			p_campaign: "v1",
			p_min_account_age_days: 90,
			p_limit: 50,
		});

		state.bindings = { ...state.bindings, FEEDBACK_REQUEST_DAILY_LIMIT: "5", FEEDBACK_REQUEST_CAMPAIGN: "v2" };
		state.rpc.mockResolvedValueOnce({ data: 0, error: null });
		await enqueueFeedbackRequestEmails();
		expect(state.rpc).toHaveBeenLastCalledWith("enqueue_feedback_request_emails", {
			p_campaign: "v2",
			p_min_account_age_days: 90,
			p_limit: 5,
		});

		state.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
		await expect(enqueueFeedbackRequestEmails()).rejects.toThrow("feedback_request_enqueue_error:boom");
	});
});
