// Connected MCP servers on Phaseo's MCP server. For a person whose token has
// connections:use, every tool of the servers they connected in Settings >
// Connections is registered here as "<label>__<tool>", and calls are passed to
// the gateway's MCP hub, which holds the upstream tokens. This worker never
// sees those tokens.

import type { McpServer, StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import type { AuthenticatedPhaseoUser, PhaseoEnv } from "./phaseo-api";

export const CONNECTIONS_USE_SCOPE = "connections:use";
const SETTINGS_URL = "https://phaseo.app/settings/connections";
const LIST_TIMEOUT_MS = 9_000;
const CALL_TIMEOUT_MS = 60_000;

export type HubTool = {
	name: string;
	connectionId: string;
	connectionName: string;
	upstreamName: string;
	title?: string;
	description?: string;
	inputSchema: Record<string, unknown>;
	annotations?: Record<string, unknown>;
};

export type HubConnection = { id: string; label: string; name: string; status: string; toolCount: number; error: string | null };

export type HubListing = { tools: HubTool[]; connections: HubConnection[]; error?: string };

type CallResult = { content: Array<Record<string, unknown>>; structuredContent?: Record<string, unknown>; isError?: boolean };

export function hubAvailable(env: PhaseoEnv, user: AuthenticatedPhaseoUser): boolean {
	return env.MCP_HUB_ENABLED === "true" && user.scopes.includes(CONNECTIONS_USE_SCOPE) && Boolean(user.resourceToken && user.resource);
}

async function hubRequest(env: PhaseoEnv, user: AuthenticatedPhaseoUser, path: "/tools" | "/call", body: Record<string, unknown>, timeoutMs: number): Promise<Response> {
	const base = env.PHASEO_API_BASE_URL.endsWith("/") ? env.PHASEO_API_BASE_URL : `${env.PHASEO_API_BASE_URL}/`;
	const request = new Request(new URL(`internal/mcp-hub${path}`, base), {
		method: "POST",
		signal: AbortSignal.timeout(timeoutMs),
		headers: {
			Authorization: `Basic ${btoa(`phaseo_mcp_resource_server:${env.PHASEO_MCP_RESOURCE_SERVER_SECRET}`)}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ subject_token: user.resourceToken, resource: user.resource, ...body }),
	});
	return env.PHASEO_API ? env.PHASEO_API.fetch(request) : fetch(request);
}

/** The person's connected tools. Failures leave Phaseo's own tools working. */
export async function fetchHubListing(env: PhaseoEnv, user: AuthenticatedPhaseoUser): Promise<HubListing> {
	try {
		const response = await hubRequest(env, user, "/tools", {}, LIST_TIMEOUT_MS);
		const payload = await response.json().catch(() => null) as Partial<HubListing> & { message?: string } | null;
		if (!response.ok || !payload) return { tools: [], connections: [], error: payload?.message ?? "Connected servers are unavailable right now." };
		return { tools: Array.isArray(payload.tools) ? payload.tools : [], connections: Array.isArray(payload.connections) ? payload.connections : [] };
	} catch {
		return { tools: [], connections: [], error: "Connected servers are unavailable right now." };
	}
}

/**
 * Advertises the upstream JSON Schema unchanged and leaves argument checks to
 * the upstream server, which knows its own schema; this only requires an object.
 */
type ToolArguments = Record<string, unknown>;

function passthroughSchema(schema: Record<string, unknown>): StandardSchemaWithJSON<ToolArguments> {
	return {
		"~standard": {
			version: 1,
			vendor: "phaseo-connections",
			validate: (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value)
				? { value: value as ToolArguments }
				: { issues: [{ message: "Tool arguments must be an object." }] },
			jsonSchema: { input: () => schema, output: () => schema },
		},
	};
}

function hintAnnotations(tool: HubTool) {
	const annotations: Record<string, boolean> = { openWorldHint: true };
	for (const hint of ["readOnlyHint", "destructiveHint", "idempotentHint"] as const) {
		if (typeof tool.annotations?.[hint] === "boolean") annotations[hint] = tool.annotations[hint] as boolean;
	}
	// Unless the server says otherwise, treat a tool as able to change things, so clients ask first.
	if (annotations.readOnlyHint !== true && annotations.destructiveHint === undefined) annotations.destructiveHint = true;
	return annotations;
}

function textResult(text: string, isError = false) {
	return { ...(isError ? { isError: true as const } : {}), content: [{ type: "text" as const, text }] };
}

export function registerHubTools(server: McpServer, env: PhaseoEnv, user: AuthenticatedPhaseoUser, listing: HubListing): void {
	const meta = { securitySchemes: [{ type: "oauth2", scopes: [CONNECTIONS_USE_SCOPE] }] };

	server.registerTool(
		"connections_list",
		{
			title: "List connected servers",
			description: "List the MCP servers you connected in Phaseo (Settings > Connections), whether each is working, and how many tools it provides. Read-only.",
			inputSchema: {},
			annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
			_meta: meta,
		},
		async () => {
			const lines = listing.connections.map((connection) => {
				const state = connection.error ? `unavailable: ${connection.error}` : connection.status === "active" ? `${connection.toolCount} tools` : "sign in again";
				return `- ${connection.name} (${connection.label}__*): ${state}`;
			});
			const text = listing.connections.length
				? `Connected servers:\n${lines.join("\n")}\n\nManage them at ${SETTINGS_URL}.`
				: `No servers are connected yet. Connect Linear, Notion and others at ${SETTINGS_URL}.`;
			return { content: [{ type: "text" as const, text: listing.error ? `${listing.error}\n\n${text}` : text }], structuredContent: { connections: listing.connections } };
		},
	);

	for (const tool of listing.tools) {
		const label = tool.title ?? tool.upstreamName;
		server.registerTool<StandardSchemaWithJSON, StandardSchemaWithJSON<ToolArguments>>(
			tool.name,
			{
				title: `${tool.connectionName}: ${label}`,
				description: `From your connected ${tool.connectionName} server (via Phaseo). ${tool.description ?? ""}`.trim(),
				inputSchema: passthroughSchema(tool.inputSchema),
				annotations: hintAnnotations(tool),
				_meta: meta,
			},
			async (args) => {
				try {
					const response = await hubRequest(env, user, "/call", { connection_id: tool.connectionId, tool: tool.upstreamName, arguments: args ?? {} }, CALL_TIMEOUT_MS);
					const payload = await response.json().catch(() => null) as { result?: CallResult; message?: string } | null;
					if (!response.ok || !payload?.result) return textResult(payload?.message ?? `${tool.connectionName} could not run this tool.`, true);
					return {
						content: payload.result.content as never,
						...(payload.result.structuredContent ? { structuredContent: payload.result.structuredContent } : {}),
						...(payload.result.isError ? { isError: true as const } : {}),
					};
				} catch {
					return textResult(`${tool.connectionName} did not answer in time.`, true);
				}
			},
		);
	}
}
