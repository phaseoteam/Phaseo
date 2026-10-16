import { activeAgentsLimit } from "./orchestration";
import { autoSettleDays } from "./threadLifecycle";

/** maxActiveAgents caps concurrently active delegated agents across the workspace (Settings → General). autoSettleAfterDays settles idle Code chats; null never does. titleModel names new chats with that Phaseo model; null keeps the first message. autoSettleOnMerge and keepPullRequests are T3's pull request rules for auto-settle. openPullRequestsInApp opens pull request links in the pane rather than the browser. */
export type WorkspacePreferences = { notifications: "off" | "attention" | "all"; notificationTitles: boolean; maxActiveAgents: number; autoSettleAfterDays: number | null; autoSettleOnMerge: boolean; keepPullRequests: boolean; titleModel: string | null; openPullRequestsInApp: boolean };
export const defaultPreferences: WorkspacePreferences = { notifications: "off", notificationTitles: false, maxActiveAgents: activeAgentsLimit.default, autoSettleAfterDays: autoSettleDays.default, autoSettleOnMerge: true, keepPullRequests: false, titleModel: null, openPullRequestsInApp: true };
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
	const flag = (key: string, fallback: boolean, message = "Invalid auto-settle setting.") => { const value = input[key] === undefined ? fallback : input[key]; if (typeof value !== "boolean") throw new Error(message); return value; };
	return { notifications: input.notifications as WorkspacePreferences["notifications"], notificationTitles: input.notificationTitles, maxActiveAgents, autoSettleAfterDays, autoSettleOnMerge: flag("autoSettleOnMerge", true), keepPullRequests: flag("keepPullRequests", false), titleModel, openPullRequestsInApp: flag("openPullRequestsInApp", true, "Invalid pull request setting.") };
}
