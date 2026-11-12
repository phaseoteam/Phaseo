import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import {
	MCP_READ_SCOPES,
	PHASEO_MCP_URL,
	createMcpTokenSource,
	exchangeCliTokenForMcp,
	mcpEndpoint,
	mcpScopes,
	parseSseMessages,
	runMcpBridge,
} from "../src/mcp.ts";

type Call = { url: string; init: RequestInit };

function jsonResponse(body: unknown, init: ResponseInit = {}) {
	return new Response(JSON.stringify(body), { status: 200, ...init, headers: { "content-type": "application/json", ...init.headers } });
}

async function bridge(lines: string[], respond: (call: Call, index: number) => Response | Promise<Response>, tokens = { get: async () => "t1", renew: async () => "t2" }) {
	const input = new PassThrough();
	const output = new PassThrough();
	const calls: Call[] = [];
	const logs: string[] = [];
	let written = "";
	output.on("data", (chunk) => { written += String(chunk); });
	const fetchImpl = (async (url: string, init: RequestInit) => {
		calls.push({ url: String(url), init });
		return respond({ url: String(url), init }, calls.length - 1);
	}) as typeof fetch;
	const done = runMcpBridge({ endpoint: PHASEO_MCP_URL, tokens, input, output, fetchImpl, log: (line) => logs.push(line) });
	for (const line of lines) input.write(`${line}\n`);
	input.end();
	await done;
	const messages = written.split("\n").filter(Boolean).map((line) => JSON.parse(line));
	return { calls, messages, logs, written };
}

const header = (call: Call, name: string) => new Headers(call.init.headers).get(name);

test("plain `phaseo mcp` asks only for read scopes; --manage adds management and the manage URL", () => {
	assert.deepEqual(mcpScopes(false), [...MCP_READ_SCOPES]);
	assert.ok(!mcpScopes(false).some((scope) => scope.endsWith(":write") || scope.endsWith(":delete")));
	assert.ok(mcpScopes(true).includes("keys:write"));
	assert.ok(!mcpScopes(true).includes("gateway:access"), "the bridge never asks for paid model calls");
	assert.equal(mcpEndpoint(PHASEO_MCP_URL, false), "https://mcp.phaseo.app/mcp");
	assert.equal(mcpEndpoint(PHASEO_MCP_URL, true), "https://mcp.phaseo.app/mcp?access=manage");
});

test("swaps the CLI token with an RFC 8693 token exchange for the MCP resource", async () => {
	let sent: Record<string, unknown> = {};
	const token = await exchangeCliTokenForMcp({
		tokenUrl: "https://api.phaseo.app/oauth/token",
		subjectToken: "cli-access",
		resource: PHASEO_MCP_URL,
		scopes: ["models:read"],
		now: () => 1_000,
		fetchImpl: (async (_url: string, init: RequestInit) => {
			sent = JSON.parse(String(init.body));
			return jsonResponse({ access_token: "mcp-token", expires_in: 900, scope: "models:read" });
		}) as typeof fetch,
	});
	assert.deepEqual(sent, {
		grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
		client_id: "phaseo_cli",
		subject_token: "cli-access",
		subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
		requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
		resource: PHASEO_MCP_URL,
		scope: "models:read",
	});
	assert.deepEqual(token, { accessToken: "mcp-token", expiresAt: 901_000, scope: "models:read" });
});

test("explains a failed swap without echoing tokens", async () => {
	await assert.rejects(exchangeCliTokenForMcp({
		tokenUrl: "https://api.phaseo.app/oauth/token",
		subjectToken: "secret-cli-access",
		resource: PHASEO_MCP_URL,
		scopes: ["models:read"],
		fetchImpl: (async () => jsonResponse({ error: "invalid_grant", error_description: "subject_token is invalid or expired" }, { status: 400 })) as typeof fetch,
	}), (error: Error) => /phaseo login/.test(error.message) && !error.message.includes("secret-cli-access"));
	await assert.rejects(exchangeCliTokenForMcp({
		tokenUrl: "https://api.phaseo.app/oauth/token",
		subjectToken: "x",
		resource: PHASEO_MCP_URL,
		scopes: ["models:read"],
		fetchImpl: (async () => jsonResponse({ error: "unsupported_grant_type" }, { status: 400 })) as typeof fetch,
	}), /does not support `phaseo mcp` yet/);
});

test("token source reuses a fresh token, swaps near expiry, and shares one swap between callers", async () => {
	let now = 0;
	let loads = 0;
	const source = createMcpTokenSource(async () => {
		loads += 1;
		return { accessToken: `token-${loads}`, expiresAt: now + 900_000, scope: "" };
	}, () => now);
	assert.deepEqual(await Promise.all([source.get(), source.get()]), ["token-1", "token-1"]);
	now = 800_000;
	assert.equal(await source.get(), "token-1");
	now = 850_000; // under a minute left
	assert.equal(await source.get(), "token-2");
	assert.equal(await source.renew(), "token-3");
	assert.equal(loads, 3);
});

test("relays JSON and SSE replies, keeping the MCP session and protocol version", async () => {
	const { calls, messages } = await bridge([
		JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
		JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
		JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
	], (call, index) => {
		if (index === 0) return jsonResponse({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2026-06-18" } }, { headers: { "mcp-session-id": "s-1" } });
		if (call.init.method === "DELETE") return new Response(null, { status: 204 });
		const body = JSON.parse(String(call.init.body));
		if (!body.id) return new Response(null, { status: 202 });
		return new Response(`event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"tools":[]}}\n\n`, { headers: { "content-type": "text/event-stream" } });
	});
	assert.deepEqual(messages, [
		{ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2026-06-18" } },
		{ jsonrpc: "2.0", id: 2, result: { tools: [] } },
	]);
	assert.equal(header(calls[0]!, "authorization"), "Bearer t1");
	assert.equal(header(calls[0]!, "accept"), "application/json, text/event-stream");
	assert.equal(header(calls[0]!, "mcp-session-id"), null);
	const later = calls.filter((call) => call.init.method === "POST").slice(1);
	assert.ok(later.every((call) => header(call, "mcp-session-id") === "s-1" && header(call, "mcp-protocol-version") === "2026-06-18"));
	assert.equal(calls.at(-1)?.init.method, "DELETE", "ends the MCP session when the agent closes stdin");
});

test("retries once with a new token after a 401", async () => {
	const { calls, messages } = await bridge([JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" })], (_call, index) => (index === 0
		? new Response("expired", { status: 401 })
		: jsonResponse({ jsonrpc: "2.0", id: 7, result: { tools: [] } })));
	assert.deepEqual(calls.map((call) => header(call, "authorization")), ["Bearer t1", "Bearer t2"]);
	assert.deepEqual(messages, [{ jsonrpc: "2.0", id: 7, result: { tools: [] } }]);
});

test("turns HTTP and network failures into JSON-RPC errors for requests, and never writes non-JSON to stdout", async () => {
	const { messages, logs, written } = await bridge([
		"not json",
		JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call" }),
		JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled" }),
	], (call) => {
		const body = JSON.parse(String(call.init.body));
		if (body.id === 3) return new Response("boom", { status: 500 });
		throw new Error("network down");
	});
	for (const line of written.split("\n").filter(Boolean)) JSON.parse(line);
	assert.deepEqual(messages.find((message) => message.id === null)?.error?.code, -32700);
	assert.match(messages.find((message) => message.id === 3)?.error?.message ?? "", /HTTP 500/);
	assert.equal(messages.length, 2, "a failed notification has no reply");
	assert.deepEqual(logs, ["network down"]);
});

test("parses multi-line SSE data and skips non-JSON events", () => {
	assert.deepEqual(parseSseMessages(": ping\n\ndata: {\"a\":\ndata: 1}\n\ndata: not-json\n\n"), [{ a: 1 }]);
});
