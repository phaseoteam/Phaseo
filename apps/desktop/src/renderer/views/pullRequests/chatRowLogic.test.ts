import { describe, expect, it } from "vitest";
import type { PullRequestCheck, PullRequestView } from "../../../shared/pullRequestView";
import { chatRowAction, describeChecks } from "./chatRowLogic";

const viewer = { canUpdate: true, canMerge: true, canDeleteBranch: false, canEnableAutoMerge: false, canDisableAutoMerge: false };
const view = (patch: Partial<PullRequestView> = {}) => ({ state: "OPEN", draft: false, mergeable: "MERGEABLE", viewer, mergeMethods: ["squash"], checkRuns: [{ name: "ci", status: "success" }], ...patch }) as PullRequestView;

describe("a chat row's next step", () => {
	it("ranks conflicts, drafts, failing checks, then merge", () => {
		expect(chatRowAction(view({ mergeable: "CONFLICTING", draft: true }))).toBe("resolve");
		expect(chatRowAction(view({ draft: true }))).toBe("ready");
		expect(chatRowAction(view({ draft: true, viewer: { ...viewer, canUpdate: false } }))).toBeNull();
		expect(chatRowAction(view({ checkRuns: [{ name: "ci", status: "failure" }, { name: "b", status: "pending" }] }))).toBe("fix");
		expect(chatRowAction(view({ checkRuns: [{ name: "ci", status: "pending" }] }))).toBeNull();
		expect(chatRowAction(view())).toBe("merge");
		expect(chatRowAction(view({ checkRuns: [] }))).toBe("merge");
		expect(chatRowAction(view({ mergeMethods: [] }))).toBeNull();
		expect(chatRowAction(view({ state: "MERGED" }))).toBeNull();
		expect(chatRowAction(undefined)).toBeNull();
	});
	it("describes every live facet of the checks", () => {
		const checks = (...statuses: PullRequestCheck["status"][]) => statuses.map((status, index) => ({ name: `c${index}`, status }));
		expect(describeChecks([])).toBe("No checks reported");
		expect(describeChecks(checks("pending", "failure", "success"))).toBe("1 of 3 running · 1 failed");
		expect(describeChecks(checks("failure", "success"))).toBe("1 of 2 failing");
		expect(describeChecks(checks("success", "success"))).toBe("All checks passed");
		expect(describeChecks(checks("success", "skipped"))).toBe("1 of 2 passing");
	});
});
