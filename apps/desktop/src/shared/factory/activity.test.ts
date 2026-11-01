import { describe, expect, it } from "vitest";
import { STALL_AFTER, STALL_GRACE, activityMessage, checksActivity, heldBackLine, lastProgress, sortActivity, stallAction, stallSummary, trustedActivity, type GithubActivity } from "./activity";
import type { LogLine } from "./types";

const entry = (patch: Partial<GithubActivity>): GithubActivity => ({ id: "comment:1", kind: "comment", author: "maria", association: "MEMBER", body: "Round half up, not down.", at: 1_000, ...patch });

describe("which GitHub activity goes to agents", () => {
	it("passes on people who can push, GitHub's checks and known review bots, and holds back everyone else", () => {
		expect(trustedActivity(entry({ association: "OWNER" }))).toBe(true);
		expect(trustedActivity(entry({ association: "COLLABORATOR" }))).toBe(true);
		expect(trustedActivity(entry({ association: "CONTRIBUTOR" }))).toBe(false);
		expect(trustedActivity(entry({ association: "NONE" }))).toBe(false);
		expect(trustedActivity(entry({ association: undefined }))).toBe(false);
		expect(trustedActivity(entry({ kind: "checks", author: "github", association: undefined }))).toBe(true);
		expect(trustedActivity(entry({ author: "chatgpt-codex-connector[bot]", bot: true, association: "NONE" }))).toBe(true);
		// A bot isn't trusted for the access of whoever installed it.
		expect(trustedActivity(entry({ author: "github-actions[bot]", bot: true, association: "MEMBER" }))).toBe(false);
		expect(trustedActivity(entry({ author: "renovate[bot]", association: "MEMBER" }))).toBe(false);
	});

	it("skips what the run already heard, and keeps the rest in order", () => {
		const { pass, hold } = sortActivity([
			entry({ id: "comment:3", at: 3_000 }),
			entry({ id: "comment:1", at: 1_000 }),
			entry({ id: "review:2", kind: "review", at: 2_000, state: "CHANGES_REQUESTED" }),
			entry({ id: "comment:4", author: "drive-by", association: "NONE", at: 4_000 }),
		], ["comment:1"]);
		expect(pass.map((item) => item.id)).toEqual(["review:2", "comment:3"]);
		expect(hold.map((item) => item.id)).toEqual(["comment:4"]);
		expect(heldBackLine(hold)).toBe("Didn't pass on a comment from @drive-by: only people who can push to the repository, and known review bots, direct agents");
		expect(heldBackLine([])).toBeUndefined();
	});

	it("frames the message so the stage and its report stay the same", () => {
		const text = activityMessage([
			entry({ kind: "review", author: "maria", state: "CHANGES_REQUESTED", body: "Tax first.", number: 57 }),
			entry({ id: "line:9", kind: "line", author: "chatgpt-codex-connector[bot]", path: "src/cart.js", line: 58, body: "Use Math.round.", number: 57 }),
			checksActivity("abc123", [{ name: "test (node 22)", link: "https://github.com/o/r/actions/runs/1/job/2", log: "line 1\nexpected 12.5, got 12" }], 5_000, 57),
		]);
		expect(text).toContain("Your stage, its rules and its report stay the same.");
		expect(text).toContain("@maria requested changes:\nTax first.");
		expect(text).toContain("@chatgpt-codex-connector[bot] commented on src/cart.js:58:\nUse Math.round.");
		expect(text).toContain("GitHub checks failed:\ntest (node 22) (https://github.com/o/r/actions/runs/1/job/2)\n```\nline 1\nexpected 12.5, got 12\n```");
		// One item: no "on #57" on every entry.
		expect(text).not.toContain("on #57");
		expect(activityMessage([entry({ number: 42 }), entry({ id: "comment:2", number: 57 })])).toContain("@maria commented on #57:");
	});

	it("gives failed checks one id per commit and set of checks", () => {
		expect(checksActivity("abc", [{ name: "lint" }, { name: "test" }], 1).id).toBe("checks:abc:lint,test");
	});
});

describe("stalled runs", () => {
	const line = (at: number, kind: LogLine["kind"] = "tool"): LogLine => ({ at, kind, text: `pnpm test --watch\nmore` });
	const start = 1_000_000;

	it("counts only what the agent did as progress, not Factory's notes or messages to it", () => {
		expect(lastProgress({ startedAt: start, log: [] })).toBe(start);
		expect(lastProgress({ startedAt: start, log: [line(start + 5), line(start + 9, "info"), line(start + 10, "you")] })).toBe(start + 5);
		// The thread showing it at work counts, even before a line is logged.
		expect(lastProgress({ startedAt: start, log: [line(start + 5)] }, start + 50)).toBe(start + 50);
	});

	it("tells the agent after 30 quiet minutes, then stops the run if nothing follows", () => {
		const log = [line(start + 1_000)];
		expect(stallAction({ startedAt: start, log }, start + 1_000 + STALL_AFTER - 1)).toBeUndefined();
		expect(stallAction({ startedAt: start, log }, start + 1_000 + STALL_AFTER)).toBe("nudge");
		const nudgedAt = start + 1_000 + STALL_AFTER;
		expect(stallAction({ startedAt: start, log, nudgedAt }, nudgedAt + STALL_GRACE - 1)).toBeUndefined();
		expect(stallAction({ startedAt: start, log, nudgedAt }, nudgedAt + STALL_GRACE)).toBe("stop");
		// It moved again after being told: the clock starts over.
		expect(stallAction({ startedAt: start, log, nudgedAt }, nudgedAt + STALL_GRACE, nudgedAt + 60_000)).toBeUndefined();
		expect(stallAction({ startedAt: start, log, nudgedAt }, nudgedAt + 60_000 + STALL_AFTER, nudgedAt + 60_000)).toBe("nudge");
	});

	it("says how long it was quiet and what it did last", () => {
		expect(stallSummary({ startedAt: start, log: [line(start)] }, start + 45 * 60_000)).toBe("Stalled: nothing happened for 45 minutes, even after Factory told the agent, so it was stopped. Last: pnpm test --watch");
	});
});
