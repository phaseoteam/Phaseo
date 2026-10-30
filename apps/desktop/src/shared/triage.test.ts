import { describe, expect, it } from "vitest";
import type { TraceDiagnostics } from "./diagnostics";
import { diagnosticsSection, redactLogText, triagePlaybook, triageTitle, triagePlaybookName, triagePlaybookPattern, validateIssueDraft, type PlaybookInput } from "./triage";

const build = { version: "0.1.0", commit: "821b26a8e7c9d1f2a3b4c5d6e7f8091a2b3c4d5e", builtAt: "2026-10-30T10:00:00.000Z", platform: "win32", osRelease: "10.0.26300", arch: "x64", electron: "45.0.0", chrome: "146.0.0.0", node: "24.1.0", packaged: true };
const input = (overrides: Partial<PlaybookInput> = {}): PlaybookInput => ({ build, triage: { version: "0.1.0", commit: build.commit, exact: true, repository: "phaseoteam/Phaseo" }, checkout: "C:\\data\\triage\\phaseo-821b26a8e7c9", userData: "C:\\data", diagnostics: "No failures.", offerPullRequest: false, ...overrides });
const diagnostics = (overrides: Partial<TraceDiagnostics> = {}): TraceDiagnostics => ({ traceFilePath: "C:\\Users\\Dana\\AppData\\Roaming\\Phaseo\\logs\\traces.ndjson", logsDirectory: "", scannedFilePaths: [], readAt: "", recordCount: 3, parseErrorCount: 0, failureCount: 1, slowSpanThresholdMs: 1000, slowSpanCount: 0, logLevelCounts: {}, topSpansByCount: [], slowestSpans: [], commonFailures: [], latestFailures: [], latestWarningAndErrorLogs: [], ...overrides });

describe("triage playbook", () => {
	it("pins the exact build and leaves the fix uncommitted unless a pull request was offered", () => {
		const text = triagePlaybook(input());
		expect(text).toContain("Phaseo Desktop 0.1.0, built from commit 821b26a8e7c9d1f2a3b4c5d6e7f8091a2b3c4d5e");
		expect(text).toContain("exactly commit 821b26a8e7c9 of phaseoteam/Phaseo");
		expect(text).toContain("Windows 10.0.26300 (x64), Electron 45.0.0");
		expect(text).toContain("draft an issue for phaseoteam/Phaseo with the draft_issue tool");
		expect(text).toContain("Never file it yourself");
		expect(text).toContain("Do not commit, push or open a pull request.");
		expect(text).not.toContain("gh pr create");
		const offered = triagePlaybook(input({ offerPullRequest: true, triage: { version: "0.1.0", commit: build.commit, exact: true, repository: "owner/test" } }));
		expect(offered).toContain("ask the person whether they want a pull request, and wait for their answer");
		expect(offered).toContain("gh pr create --repo owner/test");
	});
	it("warns when the checkout is main because the build's commit could not be fetched", () => {
		const text = triagePlaybook(input({ triage: { version: "0.1.0", commit: "a".repeat(40), exact: false, repository: "phaseoteam/Phaseo" } }));
		expect(text).toContain("**This checkout is not the exact build.**");
		expect(text).toContain(`so this is main at ${"a".repeat(12)}`);
		expect(triagePlaybook(input({ build: { ...build, commit: undefined }, triage: { version: "0.1.0", commit: "b".repeat(40), exact: false, repository: "phaseoteam/Phaseo" } }))).toContain("unknown: the build carries no commit");
	});
	it("titles the chat after the person's description, not the playbook link", () => {
		expect(triageTitle("Read @.phaseo-triage/playbook-20261030-140509.md and follow it.\n\nThe sidebar goes blank after I archive a chat.\nIt started today.")).toBe("Triage: The sidebar goes blank after I archive a chat.");
		expect(triageTitle("Read @.phaseo-triage/playbook-20261030-140509.md and follow it.")).toBe("Triage a Phaseo bug");
		expect(triageTitle(`Read @x and follow it. ${"word ".repeat(30)}`)).toMatch(/^Triage: (word ){13}word…$/);
	});
	it("names playbooks inside the triage folder only", () => {
		expect(triagePlaybookName(new Date("2026-10-30T14:05:09.123Z"))).toBe(".phaseo-triage/playbook-20261030-140509.md");
		expect(triagePlaybookPattern.test(triagePlaybookName())).toBe(true);
		expect(triagePlaybookPattern.test(".phaseo-triage/../../evil.md")).toBe(false);
	});
});

describe("diagnostics for triage", () => {
	it("hides the home folder in any case or slash style, and email addresses", () => {
		expect(redactLogText("ENOENT c:/users/dana/AppData/x and C:\\Users\\Dana\\y, mail dana@example.com", "C:\\Users\\Dana")).toBe("ENOENT ~/AppData/x and ~\\y, mail [email]");
		expect(redactLogText("open /home/dana/.config failed", "/home/dana")).toBe("open ~/.config failed");
	});
	it("lists the latest failures, warnings and slow operations", () => {
		const text = diagnosticsSection(diagnostics({
			latestFailures: [{ name: "projects.clone", durationMs: 812.4, endedAt: "2026-10-30T09:00:00.000Z", traceId: "t", spanId: "s", cause: "Could not clone C:\\Users\\Dana\\repo" }],
			latestWarningAndErrorLogs: [{ spanName: "Main process", level: "error", message: "boom\n  at x", seenAt: "2026-10-30T09:01:00.000Z" }],
			slowestSpans: [{ name: "store.batch", durationMs: 1520, endedAt: "2026-10-30T09:02:00.000Z", traceId: "t", spanId: "s" }],
		}), "C:\\Users\\Dana");
		expect(text).toContain("- 2026-10-30T09:00:00.000Z `projects.clone` failed after 812 ms: Could not clone ~\\repo");
		expect(text).toContain("- 2026-10-30T09:01:00.000Z error in `Main process`: boom at x");
		expect(text).toContain("`store.batch` took 1,520 ms");
		expect(diagnosticsSection(diagnostics(), "C:\\Users\\Dana")).toBe("The trace log has no failures, warnings or slow operations recorded.");
		expect(diagnosticsSection(undefined, "C:\\Users\\Dana")).toBe("The trace log could not be read.");
	});
});

describe("issue drafts", () => {
	it("needs a title and a body within GitHub's limits", () => {
		expect(validateIssueDraft({ title: "  Sidebar\n crashes ", body: " Steps \n" })).toEqual({ title: "Sidebar crashes", body: "Steps" });
		expect(() => validateIssueDraft({ title: "", body: "x" })).toThrow("title");
		expect(() => validateIssueDraft({ title: "x".repeat(257), body: "x" })).toThrow("title");
		expect(() => validateIssueDraft({ title: "x", body: "x".repeat(65_001) })).toThrow("65,000");
		expect(() => validateIssueDraft(undefined)).toThrow("title");
	});
});
