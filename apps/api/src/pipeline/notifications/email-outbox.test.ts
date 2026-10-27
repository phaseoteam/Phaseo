import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	rows: [] as Array<Record<string, unknown>>,
	updateCalls: [] as Array<{ payload: Record<string, unknown>; id: string }>,
	feedbackLimits: [] as number[],
	suppressionReason: null as string | null,
	sendEmail: vi.fn(async (_args: Record<string, unknown>) => undefined),
	isResendContactUnsubscribed: vi.fn(async (_email: string): Promise<boolean> => false),
}));

function buildSupabaseMock() {
	return {
		from(table: string) {
			if (table === "email_delivery_suppressions") {
				return {
					select: () => ({
						eq: () => ({
							maybeSingle: async () => ({
								data: state.suppressionReason ? { reason: state.suppressionReason } : null,
								error: null,
							}),
						}),
					}),
				};
			}
			if (table !== "email_outbox") {
				throw new Error(`Unexpected table: ${table}`);
			}

			return {
				select: () => ({
					is: () => ({
						lt: () => ({
							not: (column: string, operator: string, value: string) => {
								expect([column, operator, value]).toEqual(["kind", "in", '("notification_test","model_deprecation","feedback_request","rate_limit_throttled","broadcast_destination_failing","spend_alert","spend_blocked","spend_report")']);
								return {
									order: () => ({
										limit: async (limit: number) => ({
											data: state.rows.filter((row) => !["notification_test", "model_deprecation", "feedback_request", "rate_limit_throttled", "broadcast_destination_failing", "spend_alert", "spend_blocked", "spend_report"].includes(String(row.kind))).slice(0, limit),
											error: null,
										}),
									}),
								};
							},
							eq: (column: string, value: string) => {
								expect([column, value]).toEqual(["kind", "feedback_request"]);
								return {
									order: () => ({
										limit: async (limit: number) => {
											state.feedbackLimits.push(limit);
											return { data: state.rows.filter((row) => row.kind === "feedback_request").slice(0, limit), error: null };
										},
									}),
								};
							},
						}),
					}),
				}),
				update: (payload: Record<string, unknown>) => ({
					eq: async (_column: string, value: unknown) => {
						state.updateCalls.push({ payload, id: String(value) });
						return { error: null };
					},
				}),
			};
		},
	};
}

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => buildSupabaseMock(),
	getBindings: () => ({
		RESEND_API_KEY: "resend_key",
		RESEND_FROM_EMAIL: "Phaseo <noreply@example.com>",
		RESEND_TEMPLATE_LOW_BALANCE_ID: "low_balance_template",
		FEEDBACK_REQUEST_FROM_EMAIL: "Daniel <daniel@example.com>",
	}),
}));

vi.mock("@/lib/email/resend", () => ({
	sendEmail: state.sendEmail,
	isResendContactUnsubscribed: state.isResendContactUnsubscribed,
}));

describe("email outbox", () => {
	beforeEach(() => {
		state.rows.length = 0;
		state.updateCalls.length = 0;
		state.feedbackLimits.length = 0;
		state.suppressionReason = null;
		state.sendEmail.mockClear();
		state.isResendContactUnsubscribed.mockReset().mockResolvedValue(false);
		vi.resetModules();
	});

	it("does not let routed rows starve later legacy emails", async () => {
		for (let index = 0; index < 3; index += 1) {
			state.rows.push({ id: `routed_${index}`, kind: "model_deprecation", template: "model_deprecation", created_at: `2026-08-07T12:00:0${index}Z` });
		}
		state.rows.push({
			id: "legacy_email", created_at: "2026-08-07T12:01:00Z", kind: "auto_top_up_failed", template: "auto_top_up_failed",
			to_email: "owner@example.com", subject: "Auto Top-Up failed", workspace_id: "ws_1", user_id: "user_1",
			payload: { workspace_name: "Research", failure_reason: "Card declined" }, attempts: 0, last_error: null, sent_at: null,
		});
		const { drainEmailOutbox } = await import("./email-outbox");
		expect(await drainEmailOutbox(1)).toEqual({ processed: 1, sent: 1, failed: 0 });
		expect(state.sendEmail).toHaveBeenCalledTimes(1);
		expect(state.updateCalls[0]?.id).toBe("legacy_email");
	});

	it("terminates suppressed recipients without calling Resend", async () => {
		state.suppressionReason = "complained";
		state.rows.push({
			id: "email_suppressed",
			created_at: "2026-08-30T22:00:00Z",
			kind: "auto_top_up_failed",
			template: "auto_top_up_failed",
			to_email: "owner@example.com",
			subject: "Auto Top-Up failed",
			workspace_id: "ws_1",
			user_id: "user_1",
			payload: {},
			attempts: 0,
			last_error: null,
			sent_at: null,
		});

		const { drainEmailOutbox } = await import("./email-outbox");
		const summary = await drainEmailOutbox(10);

		expect(summary).toEqual({ processed: 1, sent: 0, failed: 1 });
		expect(state.sendEmail).not.toHaveBeenCalled();
		expect(state.updateCalls).toContainEqual({
			id: "email_suppressed",
			payload: { attempts: 5, last_error: "suppressed:complained" },
		});
	});

	it("sends low-balance rows through the configured Resend template", async () => {
		state.rows.push({
			id: "email_low_balance",
			created_at: "2026-08-07T12:00:00Z",
			kind: "low_balance",
			template: "low_balance",
			to_email: "owner@example.com",
			subject: "Low balance alert",
			workspace_id: "ws_1",
			user_id: null,
			payload: {
				user_first_name: "Ada",
				team_name: "Research",
				balance_usd: 8.5,
				threshold_usd: 10,
			},
			attempts: 0,
			last_error: null,
			sent_at: null,
		});

		const { drainEmailOutbox } = await import("./email-outbox");
		const summary = await drainEmailOutbox(10);

		expect(summary).toEqual({ processed: 1, sent: 1, failed: 0 });
		expect(state.sendEmail).toHaveBeenCalledWith({
			to: "owner@example.com",
			subject: "Low balance alert",
			template: {
				id: "low_balance_template",
				variables: {
					USER_FIRST_NAME: "Ada",
					BALANCE_REMAINING: 8.5,
					LOW_BALANCE_THRESHOLD: 10,
					WORKSPACE_NAME: "Research",
				},
			},
		});
	});

	it("leaves model deprecation rows for routed notification delivery", async () => {
		state.rows.push({
			id: "email_model_deprecation",
			created_at: "2026-08-07T12:00:00Z",
			kind: "model_deprecation",
			template: "model_deprecation",
			to_email: "owner@example.com",
			subject: "Example Model has been deprecated",
			workspace_id: "ws_1",
			user_id: "user_1",
			payload: { model_name: "Example Model" },
			attempts: 0,
			last_error: null,
			sent_at: null,
		});

		const { drainEmailOutbox } = await import("./email-outbox");
		await expect(drainEmailOutbox(10)).resolves.toEqual({ processed: 0, sent: 0, failed: 0 });
		expect(state.sendEmail).not.toHaveBeenCalled();
	});

	it("leaves spend rule events for routed notification delivery", async () => {
		for (const kind of ["spend_alert", "spend_blocked", "spend_report"]) {
			state.rows.push({ id: `email_${kind}`, created_at: "2026-10-21T09:00:00Z", kind, template: kind, to_email: "owner@example.com", subject: "Spend", workspace_id: "ws_1", user_id: null, payload: {}, attempts: 0, last_error: null, sent_at: null });
		}
		const { drainEmailOutbox } = await import("./email-outbox");
		await expect(drainEmailOutbox(10)).resolves.toEqual({ processed: 0, sent: 0, failed: 0 });
		expect(state.sendEmail).not.toHaveBeenCalled();
	});

	it("emails the owner copy of a model deprecation notice", async () => {
		state.rows.push({
			id: "email_model_deprecation_owner",
			created_at: "2026-08-07T12:00:00Z",
			kind: "model_deprecation_email",
			template: "model_deprecation",
			to_email: "owner@example.com",
			subject: "Model deprecation: Example Model",
			workspace_id: "ws_1",
			user_id: "user_1",
			dedupe_key: "model_deprecation:ws_1:example/model:email:user_1",
			payload: { model_name: "Example Model", deprecation_date: "2026-08-01T00:00:00.000Z" },
			attempts: 0,
			last_error: null,
			sent_at: null,
		});

		const { drainEmailOutbox } = await import("./email-outbox");
		await expect(drainEmailOutbox(10)).resolves.toMatchObject({ processed: 1, sent: 1, failed: 0 });
		expect(state.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@example.com" }));
	});

	it("renders billing alerts and passes their deduplication key to Resend", async () => {
		state.rows.push({
			id: "email_auto_top_up_failed",
			created_at: "2026-08-07T12:00:00Z",
			kind: "auto_top_up_failed",
			template: "auto_top_up_failed",
			to_email: "owner@example.com",
			subject: "Auto Top-Up failed",
			workspace_id: "ws_1",
			user_id: "user_1",
			dedupe_key: "auto_top_up_failed:pi_123",
			payload: { workspace_name: "Research", reason: "Card declined" },
			attempts: 0,
			last_error: null,
			sent_at: null,
		});

		const { drainEmailOutbox } = await import("./email-outbox");
		await drainEmailOutbox(10);

		expect(state.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
			to: "owner@example.com",
			subject: "Auto Top-Up failed",
			html: expect.stringContaining("Card declined"),
			idempotencyKey: "auto_top_up_failed:pi_123",
	}));
	});

	it("renders Slack agent refusals from the payload with their deduplication key", async () => {
		state.rows.push({
			id: "email_slack_agent_refused",
			created_at: "2026-10-22T09:30:00Z",
			kind: "slack_agent_refused",
			template: "slack_agent_refused",
			to_email: "admin@example.com",
			subject: null,
			workspace_id: "ws_1",
			user_id: "user_2",
			dedupe_key: "slack_agent_refused:inst_1:max_people:2026-10:user_2",
			payload: { workspace_name: "Research", team_name: "Research Slack", reason: "max_people", people: 40, plan_people: 50, max_people: 40, monthly_cap_usd: 25 },
			attempts: 0,
			last_error: null,
			sent_at: null,
		});

		const { drainEmailOutbox } = await import("./email-outbox");
		expect(await drainEmailOutbox(10)).toEqual({ processed: 1, sent: 1, failed: 0 });

		expect(state.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
			to: "admin@example.com",
			subject: "Slack agent: people limit reached",
			html: expect.stringContaining("limit of 40 people a month"),
			text: expect.stringContaining("Open Slack settings: https://phaseo.app/settings/slack"),
			idempotencyKey: "slack_agent_refused:inst_1:max_people:2026-10:user_2",
		}));
	});

	it("sends feedback requests from Daniel with a reply-to and one-click unsubscribe", async () => {
		const token = "0f8fad5b-d9cb-469f-a165-70867728950e";
		state.rows.push({
			id: "email_feedback",
			created_at: "2026-10-13T10:05:00Z",
			kind: "feedback_request",
			template: "feedback_request",
			to_email: "ada@example.com",
			subject: null,
			workspace_id: null,
			user_id: "user_1",
			dedupe_key: "feedback_request:v1:user_1",
			payload: { token, segment: "used_not_paid", recency: "active", first_name: "Ada" },
			attempts: 0,
			last_error: null,
			sent_at: null,
		});

		const { drainEmailOutbox } = await import("./email-outbox");
		await expect(drainEmailOutbox(10)).resolves.toEqual({ processed: 1, sent: 1, failed: 0 });

		expect(state.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
			to: "ada@example.com",
			from: "Daniel <daniel@example.com>",
			replyTo: "Daniel <daniel@example.com>",
			subject: "Quick question about Phaseo",
			headers: expect.objectContaining({ "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }),
			idempotencyKey: "feedback_request:v1:user_1",
		}));
		expect(state.isResendContactUnsubscribed).toHaveBeenCalledWith("ada@example.com");
	});

	it("sends transactional email first and at most five feedback requests per run", async () => {
		for (let index = 0; index < 8; index += 1) {
			state.rows.push({
				id: `feedback_${index}`, created_at: "2026-10-13T10:05:00Z", kind: "feedback_request", template: "feedback_request",
				to_email: `user${index}@example.com`, subject: null, workspace_id: null, user_id: `user_${index}`,
				dedupe_key: `feedback_request:v1:user_${index}`,
				payload: { token: "0f8fad5b-d9cb-469f-a165-70867728950e", segment: "paid", recency: "active" },
				attempts: 0, last_error: null, sent_at: null,
			});
		}
		state.rows.push({
			id: "later_transactional", created_at: "2026-10-13T10:06:00Z", kind: "auto_top_up_failed", template: "auto_top_up_failed",
			to_email: "owner@example.com", subject: "Auto Top-Up failed", workspace_id: "ws_1", user_id: "user_1",
			payload: { workspace_name: "Research", failure_reason: "Card declined" }, attempts: 0, last_error: null, sent_at: null,
		});

		const { drainEmailOutbox } = await import("./email-outbox");
		await expect(drainEmailOutbox(25)).resolves.toEqual({ processed: 6, sent: 6, failed: 0 });
		expect(state.sendEmail.mock.calls[0]?.[0]).toMatchObject({ to: "owner@example.com" });
		expect(state.feedbackLimits).toEqual([5]);

		state.sendEmail.mockClear();
		state.feedbackLimits.length = 0;
		await drainEmailOutbox(1);
		expect(state.feedbackLimits).toEqual([]);
		expect(state.sendEmail).toHaveBeenCalledTimes(1);
	});

	it("skips feedback requests to people unsubscribed in Resend", async () => {
		state.isResendContactUnsubscribed.mockResolvedValue(true);
		state.rows.push({
			id: "email_feedback_unsubscribed",
			created_at: "2026-10-13T10:05:00Z",
			kind: "feedback_request",
			template: "feedback_request",
			to_email: "ada@example.com",
			subject: null,
			workspace_id: null,
			user_id: "user_1",
			dedupe_key: "feedback_request:v1:user_1",
			payload: { token: "0f8fad5b-d9cb-469f-a165-70867728950e", segment: "paid", recency: "active" },
			attempts: 0,
			last_error: null,
			sent_at: null,
		});

		const { drainEmailOutbox } = await import("./email-outbox");
		await expect(drainEmailOutbox(10)).resolves.toEqual({ processed: 1, sent: 0, failed: 1 });

		expect(state.sendEmail).not.toHaveBeenCalled();
		expect(state.updateCalls).toContainEqual({
			id: "email_feedback_unsubscribed",
			payload: { attempts: 5, last_error: "unsubscribed:resend" },
		});
	});

	it("drops feedback requests queued for an account that has since been deleted", async () => {
		state.rows.push({
			id: "email_feedback_deleted_user",
			created_at: "2026-10-13T10:05:00Z",
			kind: "feedback_request",
			template: "feedback_request",
			to_email: "ada@example.com",
			subject: null,
			workspace_id: null,
			user_id: null,
			dedupe_key: "feedback_request:v1:user_1",
			payload: { token: "0f8fad5b-d9cb-469f-a165-70867728950e", segment: "paid", recency: "active" },
			attempts: 0,
			last_error: null,
			sent_at: null,
		});

		const { drainEmailOutbox } = await import("./email-outbox");
		await expect(drainEmailOutbox(10)).resolves.toEqual({ processed: 1, sent: 0, failed: 1 });

		expect(state.sendEmail).not.toHaveBeenCalled();
		expect(state.isResendContactUnsubscribed).not.toHaveBeenCalled();
		expect(state.updateCalls).toContainEqual({
			id: "email_feedback_deleted_user",
			payload: { attempts: 5, last_error: "user_deleted" },
		});
	});

	it("retries a feedback request later when the Resend contact lookup fails", async () => {
		state.isResendContactUnsubscribed.mockRejectedValue(new Error("resend_contact_lookup_error:429"));
		state.rows.push({
			id: "email_feedback_lookup_failed",
			created_at: "2026-10-13T10:05:00Z",
			kind: "feedback_request",
			template: "feedback_request",
			to_email: "ada@example.com",
			subject: null,
			workspace_id: null,
			user_id: "user_1",
			dedupe_key: "feedback_request:v1:user_1",
			payload: { token: "0f8fad5b-d9cb-469f-a165-70867728950e", segment: "paid", recency: "active" },
			attempts: 0,
			last_error: null,
			sent_at: null,
		});

		const { drainEmailOutbox } = await import("./email-outbox");
		await expect(drainEmailOutbox(10)).resolves.toEqual({ processed: 1, sent: 0, failed: 1 });

		expect(state.sendEmail).not.toHaveBeenCalled();
		expect(state.updateCalls).toContainEqual({
			id: "email_feedback_lookup_failed",
			payload: { attempts: 1, last_error: "resend_contact_lookup_error:429" },
		});
	});

	it("does not check Resend contact state for transactional mail", async () => {
		state.isResendContactUnsubscribed.mockResolvedValue(true);
		state.rows.push({
			id: "email_transactional",
			created_at: "2026-08-07T12:01:00Z",
			kind: "auto_top_up_failed",
			template: "auto_top_up_failed",
			to_email: "owner@example.com",
			subject: "Auto Top-Up failed",
			workspace_id: "ws_1",
			user_id: "user_1",
			payload: { workspace_name: "Research", failure_reason: "Card declined" },
			attempts: 0,
			last_error: null,
			sent_at: null,
		});

		const { drainEmailOutbox } = await import("./email-outbox");
		await expect(drainEmailOutbox(10)).resolves.toEqual({ processed: 1, sent: 1, failed: 0 });
		expect(state.isResendContactUnsubscribed).not.toHaveBeenCalled();
	});

	it("renders expiring payment method details", async () => {
		state.rows.push({
			id: "email_card_expiry",
			created_at: "2026-08-07T12:00:00Z",
			kind: "payment_method_expiring",
			template: "payment_method_expiring",
			to_email: "owner@example.com",
			subject: "Payment method expiring soon",
			workspace_id: "ws_1",
			user_id: "user_1",
			dedupe_key: "payment_method_expiring:ws_1:pm_123:2026-8",
			payload: { workspace_name: "Research", brand: "visa", last4: "4242", expiry: "08/2026" },
			attempts: 0,
			last_error: null,
			sent_at: null,
		});

		const { drainEmailOutbox } = await import("./email-outbox");
		await drainEmailOutbox(10);

		expect(state.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
			html: expect.stringContaining("Visa ending in 4242"),
			text: expect.stringContaining("08/2026"),
			idempotencyKey: "payment_method_expiring:ws_1:pm_123:2026-8",
		}));
	});

	it("sends security leaked key notifications without a template id", async () => {
		state.rows.push({
			id: "email_1",
			created_at: "2026-04-28T11:00:00Z",
			kind: "security_leaked_key",
			template: "security_leaked_key",
			to_email: "owner@example.com",
			subject: "Security alert: exposed API key revoked",
			workspace_id: "ws_1",
			user_id: "user_1",
			payload: {
				workspace_name: "Acme",
				key_preview: "phaseo_v1_sk_kid123...cret",
				reported_source: "github",
				evidence_url: "https://github.com/example/repo/commit/abc",
				auto_revoked: true,
			},
			attempts: 0,
			last_error: null,
			sent_at: null,
		});

		const { drainEmailOutbox } = await import("./email-outbox");
		const summary = await drainEmailOutbox(10);

		expect(summary).toEqual({ processed: 1, sent: 1, failed: 0 });
		expect(state.sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				to: "owner@example.com",
				subject: "Security alert: exposed API key revoked",
				html: expect.stringContaining("reported as publicly exposed and has been revoked"),
				text: expect.stringContaining("Key: phaseo_v1_sk_kid123...cret"),
			}),
		);
		expect(state.updateCalls[0]).toMatchObject({
			id: "email_1",
			payload: expect.objectContaining({
				last_error: null,
			}),
		});
	});

	it("escapes untrusted leaked-key fields before injecting them into HTML", async () => {
		state.rows.push({
			id: "email_2",
			created_at: "2026-04-28T11:00:00Z",
			kind: "security_leaked_key",
			template: "security_leaked_key",
			to_email: "owner@example.com",
			subject: "Security alert: exposed API key reported",
			workspace_id: "ws_1",
			user_id: "user_1",
			payload: {
				workspace_name: "<img src=x onerror=alert(1)>",
				key_preview: "\"quoted\" & key",
				reported_source: "<script>alert(1)</script>",
				evidence_url: "https://example.com/?q=<tag>&x=\"1\"",
				auto_revoked: false,
			},
			attempts: 0,
			last_error: null,
			sent_at: null,
		});

		const { drainEmailOutbox } = await import("./email-outbox");
		await drainEmailOutbox(10);

		const sent = state.sendEmail.mock.calls[0]?.[0] as { html: string; text: string };
		expect(sent.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
		expect(sent.html).toContain("&quot;quoted&quot; &amp; key");
		expect(sent.html).toContain("https://example.com/?q=&lt;tag&gt;&amp;x=&quot;1&quot;");
		expect(sent.html).not.toContain("<script>alert(1)</script>");
		expect(sent.text).toContain("Reported source: <script>alert(1)</script>");
	});
});
