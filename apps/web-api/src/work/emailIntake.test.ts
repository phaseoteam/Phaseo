import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";
import { fakeDataClient, type FakeHandler } from "./fakeDataClient.testing";

const mocks = vi.hoisted(() => ({ handler: (() => undefined) as FakeHandler, recordAsk: vi.fn(), fake: null as null | ReturnType<typeof import("./fakeDataClient.testing").fakeDataClient> }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => mocks.fake!.client }));
vi.mock("./intake", () => ({ recordAsk: mocks.recordAsk }));

const { aliasFromRecipient, handleIntakeEmail, htmlToText, intakeAddress, isAutomated, newEmailAlias, stripQuotedReply } = await import("./emailIntake");

const ALIAS = "abcdefghij0123456789";
const env = { WORK_INTAKE_EMAIL_DOMAIN: "in.phaseo.app" } as Env;

function message(raw: string, overrides: Partial<{ to: string; from: string }> = {}) {
	const bytes = new TextEncoder().encode(raw);
	const rejected: string[] = [];
	return {
		rejected,
		email: {
			from: overrides.from ?? "ana@acme.test",
			to: overrides.to ?? `ask-${ALIAS}@in.phaseo.app`,
			rawSize: bytes.byteLength,
			raw: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
			headers: new Headers(),
			setReject: (reason: string) => { rejected.push(reason); },
		},
	};
}

const MAIL = [
	"From: Ana Lima <ana@acme.test>",
	`To: ask-${ALIAS}@in.phaseo.app`,
	"Subject: Export fails",
	"MIME-Version: 1.0",
	"Content-Type: text/plain; charset=utf-8",
	"",
	"The CSV export times out for our big workspace.",
	"",
	"On Mon, 2 Nov 2026 at 10:00, Support <support@phaseo.app> wrote:",
	"> earlier message",
	"",
].join("\r\n");

beforeEach(() => {
	mocks.recordAsk.mockReset().mockResolvedValue({ reference: "r1", itemId: null });
	mocks.handler = (query) => (query.table === "work_intake_forms" ? { data: { id: "f1", workspace_id: "ws", name: "Support", enabled: true, auto_triage: true }, error: null } : { data: null, error: null });
	mocks.fake = fakeDataClient((query) => mocks.handler(query));
});

describe("email intake helpers", () => {
	it("reads the alias only from our domain", () => {
		expect(aliasFromRecipient(`Ask-${ALIAS.toUpperCase()}@IN.phaseo.app`, "in.phaseo.app")).toBe(ALIAS);
		expect(aliasFromRecipient(`ask-${ALIAS}@other.test`, "in.phaseo.app")).toBeNull();
		expect(aliasFromRecipient("ask-short@in.phaseo.app", "in.phaseo.app")).toBeNull();
		expect(intakeAddress(env, ALIAS)).toBe(`ask-${ALIAS}@in.phaseo.app`);
		expect(intakeAddress({} as Env, ALIAS)).toBeNull();
		expect(newEmailAlias()).toMatch(/^[a-z0-9]{20}$/);
	});

	it("spots automated mail", () => {
		expect(isAutomated([{ key: "Auto-Submitted", value: "auto-replied" }], "a@b.test")).toBe(true);
		expect(isAutomated([{ key: "Auto-Submitted", value: "no" }], "a@b.test")).toBe(false);
		expect(isAutomated([{ key: "Precedence", value: "bulk" }], "a@b.test")).toBe(true);
		expect(isAutomated([{ key: "List-Id", value: "x" }], "a@b.test")).toBe(true);
		expect(isAutomated([], "MAILER-DAEMON@mx.test")).toBe(true);
		expect(isAutomated([], "noreply@shop.test")).toBe(true);
		expect(isAutomated([], "ana@acme.test")).toBe(false);
	});

	it("turns HTML into text and drops quoted replies", () => {
		expect(htmlToText("<p>Hi &amp; hello</p><script>x()</script><div>Line<br>two</div>")).toBe("Hi & hello\nLine\ntwo");
		expect(stripQuotedReply("New text\n\nOn Mon, Ana wrote:\n> old")).toBe("New text");
		expect(stripQuotedReply("Just text")).toBe("Just text");
	});
});

describe("handleIntakeEmail", () => {
	it("records the mail as an ask on the alias's form, without the quoted reply", async () => {
		const { email, rejected } = message(MAIL);
		expect(await handleIntakeEmail(email, env, () => undefined)).toBe("recorded");
		expect(rejected).toEqual([]);
		const [{ form, ask }] = mocks.recordAsk.mock.calls[0] as [{ form: { id: string }; ask: Record<string, unknown> }];
		expect(form.id).toBe("f1");
		expect(ask).toMatchObject({ subject: "Export fails", name: "Ana Lima", email: "ana@acme.test", metadata: { channel: "email" } });
		expect(ask.body).toBe("The CSV export times out for our big workspace.");
		const lookup = mocks.fake!.queries.find((query) => query.table === "work_intake_forms")!;
		expect(lookup.filters).toContainEqual(["eq", "email_alias", ALIAS]);
	});

	it("rejects unknown addresses and disabled forms, and ignores auto replies", async () => {
		const unknown = message(MAIL, { to: "someone@in.phaseo.app" });
		expect(await handleIntakeEmail(unknown.email, env, () => undefined)).toBe("rejected");
		mocks.handler = (query) => (query.table === "work_intake_forms" ? { data: { id: "f1", workspace_id: "ws", name: "S", enabled: false, auto_triage: true }, error: null } : { data: null, error: null });
		expect(await handleIntakeEmail(message(MAIL).email, env, () => undefined)).toBe("rejected");
		mocks.handler = (query) => (query.table === "work_intake_forms" ? { data: { id: "f1", workspace_id: "ws", name: "S", enabled: true, auto_triage: true }, error: null } : { data: null, error: null });
		const auto = message(MAIL.replace("Subject: Export fails", "Subject: Out of office\r\nAuto-Submitted: auto-replied"));
		expect(await handleIntakeEmail(auto.email, env, () => undefined)).toBe("ignored");
		expect(mocks.recordAsk).not.toHaveBeenCalled();
	});

	it("rejects everything while no domain is set", async () => {
		expect(await handleIntakeEmail(message(MAIL).email, {} as Env, () => undefined)).toBe("rejected");
	});
});
