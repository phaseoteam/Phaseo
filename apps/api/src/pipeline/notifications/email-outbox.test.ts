import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	rows: [] as Array<Record<string, unknown>>,
	updateCalls: [] as Array<{ payload: Record<string, unknown>; id: string }>,
	suppressionReason: null as string | null,
	sendEmail: vi.fn(async (_args: Record<string, unknown>) => undefined),
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
							order: () => ({
								limit: async () => ({
									data: state.rows,
									error: null,
								}),
							}),
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
	}),
}));

vi.mock("@/lib/email/resend", () => ({
	sendEmail: state.sendEmail,
}));

describe("email outbox", () => {
	beforeEach(() => {
		state.rows.length = 0;
		state.updateCalls.length = 0;
		state.suppressionReason = null;
		state.sendEmail.mockClear();
		vi.resetModules();
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
