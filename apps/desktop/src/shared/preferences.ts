export type WorkspacePreferences = { notifications: "off" | "attention" | "all"; notificationTitles: boolean };
export const defaultPreferences: WorkspacePreferences = { notifications: "off", notificationTitles: false };
export function validatePreferences(value: unknown): WorkspacePreferences {
	if (!value || typeof value !== "object") throw new Error("Invalid workspace preferences.");
	const input = value as Record<string, unknown>;
	if (typeof input.notifications !== "string" || !["off", "attention", "all"].includes(input.notifications) || typeof input.notificationTitles !== "boolean") throw new Error("Invalid notification preferences.");
	return { notifications: input.notifications as WorkspacePreferences["notifications"], notificationTitles: input.notificationTitles };
}
