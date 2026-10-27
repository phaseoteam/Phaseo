import { activeAgentsLimit } from "./orchestration";
import { autoSettleDays } from "./threadLifecycle";
import type { PullRequestMergeMethod } from "./pullRequestView";

/**
 * maxActiveAgents caps concurrently active delegated agents across the workspace (Settings → General). autoSettleAfterDays settles idle Code chats; null never does. titleModel names new chats with that Phaseo model; null keeps the first message. autoSettleOnMerge and keepPullRequests are T3's pull request rules for auto-settle.
 * openPullRequestsInApp opens pull request links in Phaseo's pull request pane rather than on GitHub (T3's pullRequestLinksOpenInApp); pullRequestMergeMethod is the merge method pull requests start with, null for the last one chosen; diffFilesCollapsed starts diffs and the Code tab with files folded.
 * autopilot allows chats to run in Autopilot (Settings → Experimental, off by default); autopilotModel answers for chats whose own model is not on Phaseo, null for the title model.
 * worktreeCleanup holds T3's worktree cleanup rules; enabled runs them on their own (off by default), while Clean up now uses them either way.
 */
export type WorktreeCleanupRules = { enabled: boolean; /** Inactive for this many days; null never. */ afterDays: number | null; /** Every chat settled for this many days; null never. */ settledAfterDays: number | null; onMerge: boolean; unchanged: boolean; /** No chat uses it any more (T3's deleted threads). */ orphaned: boolean };
export const defaultWorktreeCleanup: WorktreeCleanupRules = { enabled: false, afterDays: 30, settledAfterDays: 7, onMerge: true, unchanged: true, orphaned: true };
export type WorkspacePreferences = { notifications: "off" | "attention" | "all"; notificationTitles: boolean; maxActiveAgents: number; autoSettleAfterDays: number | null; autoSettleOnMerge: boolean; keepPullRequests: boolean; titleModel: string | null; openPullRequestsInApp: boolean; pullRequestMergeMethod: PullRequestMergeMethod | null; diffFilesCollapsed: boolean; autopilot: boolean; autopilotModel: string | null; worktreeCleanup: WorktreeCleanupRules };
export const defaultPreferences: WorkspacePreferences = { notifications: "off", notificationTitles: false, maxActiveAgents: activeAgentsLimit.default, autoSettleAfterDays: autoSettleDays.default, autoSettleOnMerge: true, keepPullRequests: false, titleModel: null, openPullRequestsInApp: true, pullRequestMergeMethod: null, diffFilesCollapsed: false, autopilot: false, autopilotModel: null, worktreeCleanup: defaultWorktreeCleanup };
export const isMergeMethod = (value: unknown): value is PullRequestMergeMethod => value === "merge" || value === "squash" || value === "rebase";
function validateWorktreeCleanup(value: unknown): WorktreeCleanupRules {
	if (value === undefined) return { ...defaultWorktreeCleanup };
	const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
	const days = (entry: unknown) => entry === null || (typeof entry === "number" && Number.isInteger(entry) && entry >= 0 && entry <= 3650);
	if (!input || !days(input.afterDays) || !days(input.settledAfterDays) || ["enabled", "onMerge", "unchanged", "orphaned"].some(key => typeof input[key] !== "boolean")) throw new Error("Invalid worktree cleanup setting.");
	return { enabled: input.enabled as boolean, afterDays: input.afterDays as number | null, settledAfterDays: input.settledAfterDays as number | null, onMerge: input.onMerge as boolean, unchanged: input.unchanged as boolean, orphaned: input.orphaned as boolean };
}
export function validatePreferences(value: unknown): WorkspacePreferences {
	if (!value || typeof value !== "object") throw new Error("Invalid workspace preferences.");
	const input = value as Record<string, unknown>;
	if (typeof input.notifications !== "string" || !["off", "attention", "all"].includes(input.notifications) || typeof input.notificationTitles !== "boolean") throw new Error("Invalid notification preferences.");
	// Preferences saved before the agent limit existed omit it.
	const maxActiveAgents = input.maxActiveAgents === undefined ? activeAgentsLimit.default : input.maxActiveAgents;
	if (typeof maxActiveAgents !== "number" || !Number.isInteger(maxActiveAgents) || maxActiveAgents < activeAgentsLimit.minimum || maxActiveAgents > activeAgentsLimit.maximum) throw new Error(`Agents running at once must be a whole number from ${activeAgentsLimit.minimum} to ${activeAgentsLimit.maximum}.`);
	const autoSettleAfterDays = input.autoSettleAfterDays === undefined ? autoSettleDays.default : input.autoSettleAfterDays;
	if (autoSettleAfterDays !== null && (typeof autoSettleAfterDays !== "number" || !Number.isInteger(autoSettleAfterDays) || autoSettleAfterDays < autoSettleDays.minimum || autoSettleAfterDays > autoSettleDays.maximum)) throw new Error(`Auto-settle must be a whole number of days from ${autoSettleDays.minimum} to ${autoSettleDays.maximum}, or never.`);
	const titleModel = input.titleModel === undefined ? null : input.titleModel;
	if (titleModel !== null && (typeof titleModel !== "string" || !titleModel.trim() || titleModel.length > 200 || [...titleModel].some(character => character.charCodeAt(0) < 32))) throw new Error("Choose a valid model for chat titles.");
	const autopilotModel = input.autopilotModel === undefined ? null : input.autopilotModel;
	if (autopilotModel !== null && (typeof autopilotModel !== "string" || !autopilotModel.trim() || autopilotModel.length > 200 || [...autopilotModel].some(character => character.charCodeAt(0) < 32))) throw new Error("Choose a valid model for Autopilot.");
	const flag = (key: string, fallback: boolean, message = "Invalid auto-settle setting.") => { const value = input[key] === undefined ? fallback : input[key]; if (typeof value !== "boolean") throw new Error(message); return value; };
	const mergeMethod = input.pullRequestMergeMethod ?? null;
	if (mergeMethod !== null && !isMergeMethod(mergeMethod)) throw new Error("Choose a merge method.");
	return { notifications: input.notifications as WorkspacePreferences["notifications"], notificationTitles: input.notificationTitles, maxActiveAgents, autoSettleAfterDays, autoSettleOnMerge: flag("autoSettleOnMerge", true), keepPullRequests: flag("keepPullRequests", false), titleModel, openPullRequestsInApp: flag("openPullRequestsInApp", true, "Invalid pull request setting."), pullRequestMergeMethod: mergeMethod, diffFilesCollapsed: flag("diffFilesCollapsed", false, "Invalid diff setting."), autopilot: flag("autopilot", false, "Invalid Autopilot setting."), autopilotModel, worktreeCleanup: validateWorktreeCleanup(input.worktreeCleanup) };
}
