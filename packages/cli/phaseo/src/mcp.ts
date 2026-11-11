import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { CLI_VERSION } from "./generated/meta.js";

/**
 * `phaseo mcp`: runs the Phaseo MCP for local agents over stdio, signed in with the CLI's own login.
 *
 * The hosted MCP at mcp.phaseo.app only accepts tokens issued for it. The CLI swaps its session's
 * access token for a short-lived token whose only audience is the MCP (OAuth token exchange, first
 * party CLI only), so no second sign-in is needed and the MCP never accepts an ordinary API token.
 * The swapped token never carries more than the CLI session holds, and never gateway:access.
 */
export const PHASEO_MCP_URL = "https://mcp.phaseo.app/mcp";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";
const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";

// Kept in step with RESOURCE_BOUND_MCP_SCOPES and MCP_MANAGEMENT_SCOPES in apps/api/src/lib/oauth/mcpScopes.ts.
export const MCP_READ_SCOPES = [
	"models:read",
	"providers:read",
	"pricing:read",
	"credits:read",
	"activity:read",
	"analytics:read",
	"generations:read",
] as const;
export const MCP_MANAGEMENT_SCOPES = [
	"keys:read", "keys:write", "keys:delete",
	"budgets:read", "budgets:write", "budgets:delete",
	"spend_rules:read", "spend_rules:write", "spend_rules:delete",
	"provider_credentials:read", "provider_credentials:write", "provider_credentials:delete",
	"guardrails:read", "guardrails:write", "guardrails:delete",
	"presets:read", "presets:write",
	"settings:read", "settings:write",
] as const;

export function mcpScopes(manage: boolean): string[] {
	return manage ? [...MCP_READ_SCOPES, ...MCP_MANAGEMENT_SCOPES] : [...MCP_READ_SCOPES];
}

/** The URL the bridge posts to: account management needs the MCP's `?access=manage` connection. */
export function mcpEndpoint(mcpUrl: string, manage: boolean): string {
	const url = new URL(mcpUrl);
	if (manage) url.searchParams.set("access", "manage");
	return url.toString();
}

type FetchLike = typeof fetch;

export type McpToken = { accessToken: string; expiresAt: number; scope: string };

/** Swaps a CLI access token for one that only the Phaseo MCP accepts. */
export async function exchangeCliTokenForMcp(args: {
	tokenUrl: string;
	subjectToken: string;
	resource: string;
	scopes: readonly string[];
	fetchImpl?: FetchLike;
	now?: () => number;
}): Promise<McpToken> {
	const response = await (args.fetchImpl ?? fetch)(args.tokenUrl, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			grant_type: TOKEN_EXCHANGE_GRANT,
			client_id: "phaseo_cli",
			subject_token: args.subjectToken,
			subject_token_type: ACCESS_TOKEN_TYPE,
			requested_token_type: ACCESS_TOKEN_TYPE,
			resource: args.resource,
			scope: args.scopes.join(" "),
		}),
	});
	const body = await response.json().catch(() => null) as Record<string, unknown> | null;
	if (!response.ok || typeof body?.access_token !== "string" || typeof body.expires_in !== "number") {
		const reason = typeof body?.error_description === "string" ? body.error_description : `HTTP ${response.status}`;
		if (body?.error === "unsupported_grant_type") {
			throw new Error("This Phaseo API does not support `phaseo mcp` yet.");
		}
		throw new Error(`Could not sign in to the Phaseo MCP: ${reason}. Run \`phaseo login\` and try again.`);
	}
	return {
		accessToken: body.access_token,
		expiresAt: (args.now ?? Date.now)() + body.expires_in * 1000,
		scope: typeof body.scope === "string" ? body.scope : "",
	};
}

/** Holds the current MCP token and swaps for a new one shortly before it expires or after a 401. */
export function createMcpTokenSource(load: () => Promise<McpToken>, now: () => number = Date.now) {
	let current: McpToken | null = null;
	let pending: Promise<McpToken> | null = null;
	const refresh = () => {
		pending ??= load().then((token) => {
			current = token;
			return token;
		}).finally(() => {
			pending = null;
		});
		return pending;
	};
	return {
		async get(): Promise<string> {
			if (current && current.expiresAt - now() > 60_000) return current.accessToken;
			return (await refresh()).accessToken;
		},
		async renew(): Promise<string> {
			current = null;
			return (await refresh()).accessToken;
		},
	};
}

type JsonRpcMessage = { jsonrpc?: string; id?: string | number | null; method?: string; [key: string]: unknown };

function isRequest(message: JsonRpcMessage): boolean {
	return typeof message.method === "string" && message.id !== undefined && message.id !== null;
}

/** Parses a `text/event-stream` body into the JSON-RPC messages in its `data:` fields. */
export function parseSseMessages(body: string): unknown[] {
	const messages: unknown[] = [];
	for (const event of body.replace(/\r\n/g, "\n").split("\n\n")) {
		const data = event.split("\n")
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice(5).replace(/^ /, ""))
			.join("\n");
		if (!data.trim()) continue;
		try {
			messages.push(JSON.parse(data));
		} catch {
			// Not JSON-RPC (for example a keep-alive); skip it.
		}
	}
	return messages;
}

export type McpBridgeOptions = {
	endpoint: string;
	tokens: { get(): Promise<string>; renew(): Promise<string> };
	input: Readable;
	output: Writable;
	log?: (line: string) => void;
	fetchImpl?: FetchLike;
};

/**
 * Relays newline-delimited JSON-RPC from stdin to the Streamable HTTP endpoint and writes every
 * reply to stdout, one JSON message per line. Stdout carries nothing else; diagnostics go to log.
 */
export async function runMcpBridge(options: McpBridgeOptions): Promise<void> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const log = options.log ?? (() => {});
	let sessionId: string | null = null;
	let protocolVersion: string | null = null;
	const inFlight = new Set<Promise<void>>();

	const write = (message: unknown) => {
		options.output.write(`${JSON.stringify(message)}\n`);
	};
	const fail = (message: JsonRpcMessage, text: string) => {
		if (isRequest(message)) write({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: text } });
		else log(text);
	};

	const post = async (body: string, token: string) => {
		const headers: Record<string, string> = {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			"user-agent": `phaseo-cli/${CLI_VERSION} (mcp-stdio)`,
		};
		if (sessionId) headers["mcp-session-id"] = sessionId;
		if (protocolVersion) headers["mcp-protocol-version"] = protocolVersion;
		return fetchImpl(options.endpoint, { method: "POST", headers, body });
	};

	const relay = async (line: string) => {
		let message: JsonRpcMessage;
		try {
			message = JSON.parse(line) as JsonRpcMessage;
		} catch {
			write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
			return;
		}
		try {
			let response = await post(line, await options.tokens.get());
			// An expired or revoked token: swap once more (after logout the swap itself fails), then give up.
			if (response.status === 401) response = await post(line, await options.tokens.renew());
			const nextSession = response.headers.get("mcp-session-id");
			if (nextSession) sessionId = nextSession;
			if (response.status === 202 || response.status === 204) return;
			if (!response.ok) {
				const detail = (await response.text().catch(() => "")).slice(0, 300);
				fail(message, `Phaseo MCP returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
				return;
			}
			const type = response.headers.get("content-type") ?? "";
			const text = await response.text();
			const replies = type.includes("text/event-stream")
				? parseSseMessages(text)
				: text.trim() ? [JSON.parse(text)].flat() : [];
			for (const reply of replies) {
				const result = (reply as { result?: { protocolVersion?: unknown } })?.result;
				if (message.method === "initialize" && typeof result?.protocolVersion === "string") {
					protocolVersion = result.protocolVersion;
				}
				write(reply);
			}
		} catch (error) {
			fail(message, error instanceof Error ? error.message : String(error));
		}
	};

	const lines = createInterface({ input: options.input, crlfDelay: Infinity });
	// initialize must finish first so later requests carry its session and protocol version.
	let initialized: Promise<void> = Promise.resolve();
	for await (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;
		const isInitialize = /"method"\s*:\s*"initialize"/.test(line);
		const task = isInitialize
			? (initialized = relay(line))
			: initialized.then(() => relay(line));
		inFlight.add(task);
		void task.finally(() => inFlight.delete(task));
	}
	await Promise.allSettled([...inFlight]);
	if (sessionId) {
		await fetchImpl(options.endpoint, {
			method: "DELETE",
			headers: { authorization: `Bearer ${await options.tokens.get().catch(() => "")}`, "mcp-session-id": sessionId },
		}).catch(() => undefined);
	}
}
