import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGithubIssueBody, createGithubIssue, decryptGithubToken, encryptGithubToken } from "./github";

const env = { ENV: "development", ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY: "test-encryption-key" } as any;

afterEach(() => vi.unstubAllGlobals());

describe("buildGithubIssueBody", () => {
	it("uses the description for items created by hand, with a link back", () => {
		const body = buildGithubIssueBody({ number: 12, title: "Add dark mode", description: "Toggle in settings.", source: "manual", triage_summary: null });
		expect(body).toBe("## Add dark mode\n\nToggle in settings.\n\n---\n\nTracked in Phaseo: https://phaseo.app/work/12");
	});

	it("uses only the triage summary for asks and errors, never their description", () => {
		const body = buildGithubIssueBody({
			number: 3, title: "Export is empty", description: "From jane@acme.com: our export is empty", source: "ask",
			triage_summary: "CSV export returns no rows for large workspaces.",
		});
		expect(body).toContain("CSV export returns no rows");
		expect(body).not.toContain("jane@acme.com");
		expect(body).toContain("https://phaseo.app/work/3");
	});

	it("leaves out the detail when an ask has no summary yet", () => {
		const body = buildGithubIssueBody({ number: 5, title: "Ask", description: "private words", source: "ask", triage_summary: null });
		expect(body).not.toContain("private words");
	});
});

describe("GitHub token storage", () => {
	it("round-trips through the encrypted envelope", async () => {
		const stored = await encryptGithubToken(env, "github_pat_example");
		expect(stored).not.toContain("github_pat_example");
		expect(await decryptGithubToken(env, stored)).toBe("github_pat_example");
	});
});

describe("createGithubIssue", () => {
	const item = { number: 9, title: "Crash", description: "", source: "manual" as const, triage_summary: null };

	it("refuses items from outside until they are triaged", async () => {
		const ask = { ...item, title: "Subject a customer wrote", source: "ask" as const };
		expect(await createGithubIssue(env, { repo: "acme/app", github_token_ciphertext: await encryptGithubToken(env, "tok") }, ask))
			.toMatchObject({ ok: false, status: 409, code: "triage_required" });
	});

	it("needs a stored token", async () => {
		expect(await createGithubIssue(env, { repo: "acme/app", github_token_ciphertext: null }, item))
			.toMatchObject({ ok: false, status: 409, code: "github_token_missing" });
	});

	it("creates the issue with the stored token", async () => {
		const fetchMock = vi.fn(async () => Response.json({ number: 42, html_url: "https://github.com/acme/app/issues/42" }, { status: 201 }));
		vi.stubGlobal("fetch", fetchMock);
		const result = await createGithubIssue(env, { repo: "acme/app", github_token_ciphertext: await encryptGithubToken(env, "tok") }, item);
		expect(result).toEqual({ ok: true, number: 42, url: "https://github.com/acme/app/issues/42" });
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://api.github.com/repos/acme/app/issues");
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
		expect(JSON.parse(String(init.body))).toMatchObject({ title: "Crash" });
	});
});
