import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { remoteAgentToolSpecs } from "@phaseo/phone-protocol";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("agents/mcp/server", () => ({
	createMcpHandler: vi.fn(() => async () => new Response("ok", { status: 200 })),
}));

let createServer: typeof import("../src/index").createServer;
beforeAll(async () => { ({ createServer } = await import("../src/index")); });

const READ_ONLY = ["models:read", "providers:read", "pricing:read", "credits:read", "activity:read", "analytics:read", "generations:read"];
const clients: Client[] = [];
afterEach(async () => { await Promise.all(clients.splice(0).map(client => client.close())); });

/** A DESKTOP_LINKS namespace whose object answers with `answer`, recording each call and the name it was opened by. */
function links(answer: (call: Record<string, unknown>) => unknown) {
	const calls: { name: string; call: Record<string, unknown> }[] = [];
	const namespace = {
		idFromName: (name: string) => name,
		get: (name: string) => ({ fetch: async (request: Request) => { const call = await request.json() as Record<string, unknown>; calls.push({ name, call }); return Response.json(answer(call)); } }),
	};
	return { calls, namespace: namespace as unknown as DurableObjectNamespace };
}

async function connect(options: { desktopAccess?: boolean; DESKTOP_LINKS?: DurableObjectNamespace; userId?: string }) {
	const env = { PHASEO_API_BASE_URL: "https://api.phaseo.app", PHASEO_WEB_BASE_URL: "https://phaseo.app", PHASEO_MCP_RESOURCE_SERVER_SECRET: "s".repeat(64), ...options.DESKTOP_LINKS ? { DESKTOP_LINKS: options.DESKTOP_LINKS } : {} };
	const server = createServer(env, { accessToken: "upstream", workspaceId: "ws_1", scopes: READ_ONLY, clientId: "chatgpt-client", userId: options.userId ?? "user_1" }, { desktopAccess: options.desktopAccess });
	const client = new Client({ name: "desktop-test", version: "1.0.0" });
	clients.push(client);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	return client;
}
const textOf = (result: unknown) => ((result as { content: { text: string }[] }).content[0]?.text ?? "");

describe("Phaseo Desktop tools on mcp.phaseo.app", () => {
	it("are offered only on the ?access=desktop connection, with the desktop's own schemas", async () => {
		const plain = (await (await connect({})).listTools()).tools.map(tool => tool.name);
		expect(plain).not.toContain("desktop_link");
		expect(plain).not.toContain("list_threads");
		const tools = (await (await connect({ desktopAccess: true })).listTools()).tools;
		const names = tools.map(tool => tool.name);
		expect(names).toEqual(expect.arrayContaining(["desktop_link", "desktop_status", "desktop_unlink", ...remoteAgentToolSpecs.map(spec => spec.name)]));
		// The models tools stay alongside.
		expect(names).toContain("models_list");
		const launch = tools.find(tool => tool.name === "launch_thread")!;
		expect(launch.inputSchema.required).toEqual(remoteAgentToolSpecs.find(spec => spec.name === "launch_thread")!.inputSchema.required);
		expect(launch.annotations).toMatchObject({ readOnlyHint: false });
		expect(tools.find(tool => tool.name === "list_threads")!.annotations).toMatchObject({ readOnlyHint: true });
	});

	it("sends each call to the link for this user, workspace and app", async () => {
		const { calls, namespace } = links(call => call.action === "tool" ? { ok: true, result: [{ id: "chat-1", title: "Release notes" }] } : { ok: true, result: { desktopName: "Studio PC", access: "read", tools: ["list_threads"] } });
		const client = await connect({ desktopAccess: true, DESKTOP_LINKS: namespace });
		const linked = await client.callTool({ name: "desktop_link", arguments: { link: `phaseo://pair?p=${"a".repeat(40)}`, appName: "Assistant" } });
		expect(textOf(linked)).toBe("Linked to Studio PC. This connection can list and read chats there: list_threads.");
		const listed = await client.callTool({ name: "list_threads", arguments: { query: "release" } });
		expect(JSON.parse(textOf(listed))).toEqual([{ id: "chat-1", title: "Release notes" }]);
		expect(calls.map(entry => entry.call)).toEqual([
			{ action: "link", link: `phaseo://pair?p=${"a".repeat(40)}`, deviceName: "Assistant" },
			{ action: "tool", name: "list_threads", arguments: { query: "release" } },
		]);
		expect(new Set(calls.map(entry => entry.name))).toEqual(new Set([JSON.stringify(["user_1", "ws_1", "chatgpt-client"])]));
	});

	it("checks arguments against the desktop's schema before sending anything", async () => {
		const { calls, namespace } = links(() => ({ ok: true, result: [] }));
		const client = await connect({ desktopAccess: true, DESKTOP_LINKS: namespace });
		const result = await client.callTool({ name: "read_thread", arguments: { chat: "chat-1" } });
		expect(result.isError).toBe(true);
		expect(calls).toEqual([]);
	});

	it("says what to do when nothing is linked or links aren't set up", async () => {
		const { namespace } = links(() => ({ ok: false, error: "No Phaseo desktop is linked. In Phaseo Desktop, open Settings → Outside agents…" }));
		const unlinked = await (await connect({ desktopAccess: true, DESKTOP_LINKS: namespace })).callTool({ name: "list_threads", arguments: {} });
		expect(unlinked.isError).toBe(true);
		expect(textOf(unlinked)).toMatch(/^No Phaseo desktop is linked/);
		const missing = await (await connect({ desktopAccess: true })).callTool({ name: "desktop_status", arguments: {} });
		expect(textOf(missing)).toBe("Phaseo Desktop links are not configured here.");
	});
});
