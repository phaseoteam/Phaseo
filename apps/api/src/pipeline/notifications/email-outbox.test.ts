import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	rows: [] as Array<Record<string, unknown>>,
	updateCalls: [] as Array<{ payload: Record<string, unknown>; id: string }>,
	sendEmail: vi.fn(async (_args: Record<string, unknown>) => undefined),
}));

function buildSupabaseMock() {
	return {
		from(table: string) {
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
	}),
}));

vi.mock("@/lib/email/resend", () => ({
	sendEmail: state.sendEmail,
}));

describe("email outbox", () => {
	beforeEach(() => {
		state.rows.length = 0;
		state.updateCalls.length = 0;
		state.sendEmail.mockClear();
		vi.resetModules();
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
