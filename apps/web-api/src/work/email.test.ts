import { describe, expect, it, vi } from "vitest";
import { escapeHtml, sendWorkEmail, senderName, textToHtml, workEmailEnabled, workFrom } from "./email";
import { digestEmail, digestLine, runNotificationDigest } from "./emailDigest";
import { fakeDataClient, hasFilter } from "./fakeDataClient.testing";

const ON = { WORK_EMAIL_ENABLED: "true", RESEND_API_KEY: "re_test" };
const NOW = new Date("2026-11-02T12:02:00.000Z");

describe("work email", () => {
	it("is off unless the flag is true and a key is set", () => {
		expect(workEmailEnabled({})).toBe(false);
		expect(workEmailEnabled({ WORK_EMAIL_ENABLED: "true" })).toBe(false);
		expect(workEmailEnabled({ WORK_EMAIL_ENABLED: "false", RESEND_API_KEY: "k" })).toBe(false);
		expect(workEmailEnabled(ON)).toBe(true);
	});

	it("keeps header injection out of the sender name and uses the configured address", () => {
		expect(senderName('Acme "Inc" <evil@x>\r\nBcc: a@b')).toBe("Acme Inc evil@x Bcc: a@b");
		expect(workFrom({}, "Acme via Phaseo")).toBe('"Acme via Phaseo" <noreply@phaseo.app>');
		expect(workFrom({ WORK_EMAIL_FROM: "Work <work@phaseo.app>" }, null)).toBe('"Phaseo" <work@phaseo.app>');
		expect(workFrom({ WORK_EMAIL_FROM: "not an address" }, "A")).toBe('"A" <noreply@phaseo.app>');
	});

	it("escapes HTML in bodies", () => {
		expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
		expect(textToHtml("Hi <b>\nthere\n\nBye")).toBe('<p style="margin:0 0 12px">Hi &lt;b&gt;<br>there</p><p style="margin:0 0 12px">Bye</p>');
	});

	it("sends nothing when off, and reports Resend errors without throwing", async () => {
		const send = vi.fn().mockResolvedValue({ data: null, error: { name: "validation_error", message: "bad" } });
		expect(await sendWorkEmail({}, { to: "a@b.co", subject: "s", text: "t" }, { emails: { send } } as never)).toMatchObject({ ok: false, code: "email_disabled" });
		expect(send).not.toHaveBeenCalled();
		const result = await sendWorkEmail(ON, { to: "a@b.co", subject: "Line\r\nBcc: x", text: "t", replyTo: "me@acme.co", idempotencyKey: "k1" }, { emails: { send } } as never);
		expect(result).toEqual({ ok: false, code: "email_failed", message: "validation_error: bad" });
		expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: ["a@b.co"], subject: "Line Bcc: x", replyTo: "me@acme.co" }), { idempotencyKey: "k1" });
	});
});

describe("notification digests", () => {
	const row = (id: string, user: string, extra: Record<string, unknown> = {}) => ({
		id, workspace_id: "ws", user_id: user, kind: "comment", actor_name: "Ana", body: "Looks good", created_at: "2026-11-02T11:00:00Z", item: { number: 7, title: "Login fails" }, ...extra,
	});

	it("writes one line per notification and links each item", () => {
		expect(digestLine(row("1", "u") as never)).toBe("#7 Login fails: Ana commented — Looks good");
		const email = digestEmail([row("1", "u"), row("2", "u", { kind: "assigned", body: "" })] as never, "Acme", "https://phaseo.test");
		expect(email.subject).toBe("2 work updates in Acme");
		expect(email.text).toContain("https://phaseo.test/work/7");
		expect(email.text).toContain("#7 Login fails: Ana assigned you");
		expect(email.html).not.toContain("<script");
	});

	it("emails each member once, skips members who turned email off or left, and marks them emailed", async () => {
		const fake = fakeDataClient((query) => {
			if (query.table === "work_notifications" && query.op === "select") return { data: [row("1", "u1"), row("2", "u1"), row("3", "u2"), row("4", "u3")], error: null };
			if (query.table === "work_member_settings") return { data: [{ workspace_id: "ws", user_id: "u2", email_notifications: "off" }], error: null };
			if (query.table === "workspace_members") return { data: [{ workspace_id: "ws", user_id: "u1" }, { workspace_id: "ws", user_id: "u2" }], error: null };
			if (query.table === "workspaces") return { data: [{ id: "ws", name: "Acme" }], error: null };
			return { data: null, error: null };
		});
		const getUserById = vi.fn(async (id: string) => ({ data: { user: { email: `${id}@acme.co` } } }));
		fake.client.auth = { admin: { getUserById } };
		const send = vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null });
		const summary = await runNotificationDigest({ env: ON, client: fake.client, now: NOW, send: (env, email) => sendWorkEmail(env, email, { emails: { send } } as never) });
		expect(summary).toEqual({ recipients: 1, emailed: 1, skipped: 2, failed: 0 });
		expect(getUserById).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: ["u1@acme.co"], subject: "2 work updates in Acme" }), { idempotencyKey: "work-digest-1-2" });
		const marks = fake.queries.filter((query) => query.table === "work_notifications" && query.op === "update");
		const marked = marks.map((query) => query.filters.find(([name]) => name === "in")?.[2]);
		expect(marked).toHaveLength(3);
		expect(marked).toEqual(expect.arrayContaining([["1", "2"], ["3"], ["4"]]));
		const read = fake.queries.find((query) => query.table === "work_notifications" && query.op === "select")!;
		expect(hasFilter(read, "is", "read_at", null)).toBe(true);
		expect(hasFilter(read, "lte", "created_at", "2026-11-02T11:52:00.000Z")).toBe(true);
	});

	it("does nothing while work email is off", async () => {
		const fake = fakeDataClient(() => ({ data: [], error: null }));
		expect(await runNotificationDigest({ env: {}, client: fake.client, now: NOW })).toEqual({ recipients: 0, emailed: 0, skipped: 0, failed: 0 });
		expect(fake.queries).toEqual([]);
	});
});
