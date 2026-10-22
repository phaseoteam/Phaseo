import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("agents/mcp/server", () => ({ createMcpHandler: vi.fn() }));

let createServer: typeof import("../src/index").createServer;
let fetchHubListing: typeof import("../src/hub").fetchHubListing;
let hubAvailable: typeof import("../src/hub").hubAvailable;

const env = {
	PHASEO_API_BASE_URL: "https://api.phaseo.app",
	PHASEO_WEB_BASE_URL: "https://phaseo.app",
	PHASEO_MCP_RESOURCE_SERVER_SECRET: "s".repeat(64),
	MCP_HUB_ENABLED: "true",
};
const user = {
	accessToken: "upstream-token",
	workspaceId: "workspace_1",
	scopes: ["models:read", "connections:use"],
	resource: "https://mcp.phaseo.app/mcp",
	resourceToken: "person-token",
};
const listing = {
	tools: [
		{ name: "linear__list_issues", connectionId: "conn-1", connectionName: "Linear", upstreamName: "list_issues", description: "List issues.", inputSchema: { type: "object", properties: { team: { type: "string" } }, required: ["team"] }, annotations: { readOnlyHint: true } },
		{ name: "linear__delete_issue", connectionId: "conn-1", connectionName: "Linear", upstreamName: "delete_issue", inputSchema: { type: "object" } },
	],
	connections: [{ id: "conn-1", label: "linear", name: "Linear", status: "active", toolCount: 2, error: null }],
};
const clients: Client[] = [];

beforeAll(async () => {
	({ createServer } = await import("../src/index"));
	({ fetchHubListing, hubAvailable } = await import("../src/hub"));
});

afterEach(async () => {
	await Promise.all(clients.splice(0).map((client) => client.close()));
	vi.unstubAllGlobals();
});

async function connect(server: ReturnType<typeof createServer>) {
	const client = new Client({ name: "hub-test", version: "1.0.0" });
	clients.push(client);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	return client;
}

describe("connected servers on Phaseo's MCP server", () => {
	it("registers each connected tool with its upstream schema and safe hints", async () => {
		const client = await connect(createServer(env as never, user as never, listing));
		const { tools } = await client.listTools();
		const list = tools.find((tool) => tool.name === "linear__list_issues");
		expect(list).toMatchObject({
			title: "Linear: list_issues",
			inputSchema: { type: "object", properties: { team: { type: "string" } }, required: ["team"] },
			annotations: { readOnlyHint: true, openWorldHint: true },
		});
		expect(list?.description).toContain("From your connected Linear server");
		// No hints from the server: treat the tool as able to change things.
		expect(tools.find((tool) => tool.name === "linear__delete_issue")?.annotations).toMatchObject({ destructiveHint: true });
		expect(tools.some((tool) => tool.name === "connections_list")).toBe(true);
	});

	it("passes calls to the gateway hub with both credentials and returns its result", async () => {
		const requests: Array<{ url: string; headers: Headers; body: any }> = [];
		vi.stubGlobal("fetch", vi.fn(async (input: Request) => {
			requests.push({ url: input.url, headers: input.headers, body: await input.json() });
			return Response.json({ result: { content: [{ type: "text", text: "3 issues" }] }, injectionFlagged: false });
		}));
		const client = await connect(createServer(env as never, user as never, listing));
		const result = await client.callTool({ name: "linear__list_issues", arguments: { team: "ENG" } });
		expect(result.content).toEqual([{ type: "text", text: "3 issues" }]);
		expect(requests[0]?.url).toBe("https://api.phaseo.app/internal/mcp-hub/call");
		expect(requests[0]?.headers.get("authorization")).toBe(`Basic ${btoa(`phaseo_mcp_resource_server:${"s".repeat(64)}`)}`);
		expect(requests[0]?.body).toEqual({ subject_token: "person-token", resource: "https://mcp.phaseo.app/mcp", connection_id: "conn-1", tool: "list_issues", arguments: { team: "ENG" } });
	});

	it("reports hub refusals as tool errors", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "needs_reauth", message: "Linear needs you to sign in again in Settings > Connections." }, { status: 409 })));
		const client = await connect(createServer(env as never, user as never, listing));
		const result = await client.callTool({ name: "linear__list_issues", arguments: { team: "ENG" } });
		expect(result).toMatchObject({ isError: true, content: [{ type: "text", text: "Linear needs you to sign in again in Settings > Connections." }] });
	});

	it("is off without the flag or the connections:use scope, and survives a failing hub", async () => {
		expect(hubAvailable(env as never, user as never)).toBe(true);
		expect(hubAvailable({ ...env, MCP_HUB_ENABLED: undefined } as never, user as never)).toBe(false);
		expect(hubAvailable(env as never, { ...user, scopes: ["models:read"] } as never)).toBe(false);

		const client = await connect(createServer(env as never, { ...user, scopes: ["models:read"] } as never));
		const listed = await client.listTools().then((result) => result.tools, () => []);
		expect(listed.some((tool) => tool.name.startsWith("linear__") || tool.name === "connections_list")).toBe(false);

		vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
		await expect(fetchHubListing(env as never, user as never)).resolves.toMatchObject({ tools: [], connections: [], error: expect.any(String) });
	});
});
