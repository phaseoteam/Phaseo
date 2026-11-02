// Gateway keys Phaseo creates and manages for its own features. They bill like
// any key but are hidden from the Keys page, key pickers and key filters.

export const CHAT_MANAGED_KEY_NAME = "__chat_route_managed_key__";
/** The Slack agent's key, one per installation, created when the agent is installed. */
export const SLACK_AGENT_MANAGED_KEY_NAME = "__slack_agent_managed_key__";

/** The work tracker's triage agent key, one per workspace, created the first time a member runs triage. */
export const WORK_AGENT_MANAGED_KEY_NAME = "__work_agent_managed_key__";

export function isManagedKeyName(name: unknown): boolean {
	return name === CHAT_MANAGED_KEY_NAME || name === SLACK_AGENT_MANAGED_KEY_NAME || name === WORK_AGENT_MANAGED_KEY_NAME;
}

export const MANAGED_KEY_NAMES = [CHAT_MANAGED_KEY_NAME, SLACK_AGENT_MANAGED_KEY_NAME, WORK_AGENT_MANAGED_KEY_NAME] as const;

/** Leaves every managed key out of a keys query. Use with PostgREST as `.not("name", "in", MANAGED_KEY_NAMES_FILTER)`. */
export const MANAGED_KEY_NAMES_FILTER = `(${MANAGED_KEY_NAMES.map((name) => `"${name}"`).join(",")})`;
