// Gateway keys Phaseo creates and manages for its own features. They bill like
// any key but are hidden from the Keys page, key pickers and key filters.

export const CHAT_MANAGED_KEY_NAME = "__chat_route_managed_key__";
/** The Slack agent's key, one per installation, created when the agent is installed. */
export const SLACK_AGENT_MANAGED_KEY_NAME = "__slack_agent_managed_key__";

export function isManagedKeyName(name: unknown): boolean {
	return name === CHAT_MANAGED_KEY_NAME || name === SLACK_AGENT_MANAGED_KEY_NAME;
}

/**
 * Names a person or app may not give a key: the managed names and anything else wrapped in double
 * underscores, the pattern they follow. A key with one would vanish from Settings and the key limit.
 */
export function isReservedKeyName(name: unknown): boolean {
	if (typeof name !== "string") return false;
	const trimmed = name.trim();
	return isManagedKeyName(trimmed) || /^__.*__$/.test(trimmed);
}
