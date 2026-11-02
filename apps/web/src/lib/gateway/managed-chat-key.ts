export const CHAT_MANAGED_KEY_NAME = "__chat_route_managed_key__";

/** Keys Phaseo manages for its own features (Chat, the Slack agent, the work tracker's triage agent). */
export const MANAGED_KEY_NAMES = [CHAT_MANAGED_KEY_NAME, "__slack_agent_managed_key__", "__work_agent_managed_key__"] as const;

/** Leaves every managed key out of a keys query: `.not("name", "in", MANAGED_KEY_NAMES_FILTER)`. */
export const MANAGED_KEY_NAMES_FILTER = `(${MANAGED_KEY_NAMES.map((name) => `"${name}"`).join(",")})`;
