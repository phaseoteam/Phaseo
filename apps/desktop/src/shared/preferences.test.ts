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
	it("turns in-app notices and the unread badge on for preferences saved before they existed", () => {
		expect(validatePreferences({ notifications: "off", notificationTitles: false })).toMatchObject({ inAppNotifications: true, notificationBadge: true });
		expect(validatePreferences({ ...defaultPreferences, inAppNotifications: false, notificationBadge: false })).toMatchObject({ inAppNotifications: false, notificationBadge: false });
		expect(() => validatePreferences({ ...defaultPreferences, notificationBadge: "yes" })).toThrow("notification");
	});
	it("keeps Autopilot off unless it is turned on, with an optional model", () => {
		expect(validatePreferences({ notifications: "off", notificationTitles: false })).toMatchObject({ autopilot: false, autopilotModel: null });
		expect(validatePreferences({ ...defaultPreferences, autopilot: true, autopilotModel: "openai/gpt-6-mini" })).toMatchObject({ autopilot: true, autopilotModel: "openai/gpt-6-mini" });
		expect(() => validatePreferences({ ...defaultPreferences, autopilot: "on" })).toThrow("Autopilot");
		expect(() => validatePreferences({ ...defaultPreferences, autopilotModel: " " })).toThrow("Autopilot");
	});
});
