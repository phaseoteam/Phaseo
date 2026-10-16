import { describe, expect, it } from "vitest";
import { defaultPreferences, validatePreferences } from "./preferences";

describe("workspace preferences", () => {
	it("fills the pull request settings for preferences saved before they existed", () => {
		expect(validatePreferences({ notifications: "off", notificationTitles: false })).toMatchObject({ openPullRequestsInApp: true, pullRequestMergeMethod: null, diffFilesCollapsed: false });
		expect(defaultPreferences.openPullRequestsInApp).toBe(true);
	});
	it("keeps chosen values and refuses malformed ones", () => {
		expect(validatePreferences({ ...defaultPreferences, openPullRequestsInApp: false, pullRequestMergeMethod: "rebase", diffFilesCollapsed: true })).toMatchObject({ openPullRequestsInApp: false, pullRequestMergeMethod: "rebase", diffFilesCollapsed: true });
		expect(() => validatePreferences({ ...defaultPreferences, pullRequestMergeMethod: "fast-forward" })).toThrow("merge method");
		expect(() => validatePreferences({ ...defaultPreferences, openPullRequestsInApp: "yes" })).toThrow("pull request");
		expect(() => validatePreferences({ ...defaultPreferences, diffFilesCollapsed: 1 })).toThrow("diff");
	});
});
