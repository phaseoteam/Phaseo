import { remoteAgentTools, type RemoteAgentAccess } from "@phaseo/phone-protocol/agent-tools";

/**
 * Outside agents: Claude Code, Codex or any MCP client running on this computer, driving Phaseo's chats through a
 * loopback MCP server with a token the person made. Read-only tokens list and read; the others can also start chats
 * and message them. Off until the person turns it on.
 */
export type OutsideAgentAccess = RemoteAgentAccess;
export type OutsideAgentToken = { id: string; name: string; access: OutsideAgentAccess; createdAt: string; lastUsedAt?: string };
export type OutsideAgentSettings = { enabled: boolean; port: number; url: string; running: boolean; error?: string; tokens: OutsideAgentToken[] };
/** The token's secret is returned once, when it is made, and never again. */
export type CreatedOutsideAgentToken = { settings: OutsideAgentSettings; token: string };

export const defaultOutsideAgentPort = 3781;
export const outsideAgentServerName = "phaseo";
/**
 * The thread tools each access level offers. Chats an outside agent starts run supervised, so the person approves their actions.
 * The rest act for a calling chat (its browser, pages, worktree, children, instructions or projects), which an outside agent lacks.
 */
export const outsideAgentTools: Record<OutsideAgentAccess, readonly string[]> = remoteAgentTools;
export const outsideAgentAccessLabels: Record<OutsideAgentAccess, string> = { read: "Read only", start: "Can start chats" };

export function validateOutsideAgentToken(value: unknown): { name: string; access: OutsideAgentAccess } {
	const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
	const name = typeof input.name === "string" ? input.name.trim() : "";
	if (!name || name.length > 60 || [...name].some(character => character.charCodeAt(0) < 32)) throw new Error("Name the token, for example Claude Code in a terminal.");
	if (input.access !== "read" && input.access !== "start") throw new Error("Choose what the token may do.");
	return { name, access: input.access };
}
export const validOutsideAgentPort = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 1024 && Number(value) <= 65535;
/** The connector URL an AI app adds to drive the desktop through mcp.phaseo.app and Phaseo Connect. */
export const remoteAgentConnectorUrl = "https://mcp.phaseo.app/mcp?access=desktop";
/** What the person pastes into that app's chat to link it, with a link from Settings. */
export const remoteAgentLinkMessage = (link: string) => `Link my Phaseo desktop with desktop_link, using this link: ${link}`;
/** The command that adds the server to Claude Code, for the settings page to copy. */
export const claudeCodeCommand = (url: string, token: string) => `claude mcp add --transport http ${outsideAgentServerName} ${url} --header "Authorization: Bearer ${token}"`;
