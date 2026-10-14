import { activeAgentsLimit } from "./orchestration";

/** maxActiveAgents caps concurrently active delegated agents across the workspace (Settings → General). */
export type WorkspacePreferences = { notifications: "off" | "attention" | "all"; notificationTitles: boolean; maxActiveAgents: number };
export const defaultPreferences: WorkspacePreferences = { notifications: "off", notificationTitles: false, maxActiveAgents: activeAgentsLimit.default };
export function validatePreferences(value: unknown): WorkspacePreferences {
	if (!value || typeof value !== "object") throw new Error("Invalid workspace preferences.");
	const input = value as Record<string, unknown>;
	if (typeof input.notifications !== "string" || !["off", "attention", "all"].includes(input.notifications) || typeof input.notificationTitles !== "boolean") throw new Error("Invalid notification preferences.");
	// Preferences saved before the agent limit existed omit it.
	const maxActiveAgents = input.maxActiveAgents === undefined ? activeAgentsLimit.default : input.maxActiveAgents;
	if (typeof maxActiveAgents !== "number" || !Number.isInteger(maxActiveAgents) || maxActiveAgents < activeAgentsLimit.minimum || maxActiveAgents > activeAgentsLimit.maximum) throw new Error(`Agents running at once must be a whole number from ${activeAgentsLimit.minimum} to ${activeAgentsLimit.maximum}.`);
	return { notifications: input.notifications as WorkspacePreferences["notifications"], notificationTitles: input.notificationTitles, maxActiveAgents };
}
