import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("agents/mcp/server", () => ({ createMcpHandler: vi.fn() }));

let createServer: typeof import("../src/index").createServer;
let managementTools: typeof import("../src/management").managementTools;
let managementToolDescription: typeof import("../src/management").managementToolDescription;

const env = {
	PHASEO_API_BASE_URL: "https://api.phaseo.app",
	PHASEO_WEB_BASE_URL: "https://phaseo.app",
	PHASEO_MCP_RESOURCE_SERVER_SECRET: "s".repeat(64),
};
const clients: Client[] = [];

beforeAll(async () => {
	({ createServer } = await import("../src/index"));
	({ managementTools, managementToolDescription } = await import("../src/management"));
});

afterEach(async () => {
	await Promise.all(clients.splice(0).map((client) => client.close()));
	vi.unstubAllGlobals();
});

async function callLogs(clientId: string | undefined, args: Record<string, unknown>) {
	vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [{ request_id: "req_1" }] })));
	const server = createServer(env, { accessToken: "upstream", workspaceId: "ws_1", scopes: ["activity:read"], clientId });
	const client = new Client({ name: "cli-bridge-test", version: "1.0.0" });
	clients.push(client);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	const result = await client.callTool({ name: "logs_list", arguments: args });
	return (result.content as Array<{ type: string; text: string }>)[0]!.text;
}

describe("`phaseo mcp` steering", () => {
	it("points CLI-bridge agents at the CLI for full log data", async () => {
		const text = await callLogs("phaseo_cli", { since: "24h", status: "error", model: "openai/gpt-5.6-sol" });
		expect(text).toContain("`phaseo logs list --since 24h --status error --model openai/gpt-5.6-sol --limit 250 --json`");
	});

	it("keeps every log filter in the suggested command, without adding --since to a time window", async () => {
		const text = await callLogs("phaseo_cli", {
			from: "2026-11-01T00:00:00Z", to: "2026-11-02T00:00:00Z", endpoint: "responses",
			requestId: "req_123", errorCode: "upstream_timeout", provider: "openai", limit: 5, offset: 10,
		});
		expect(text).toContain("`phaseo logs list --from 2026-11-01T00:00:00Z --to 2026-11-02T00:00:00Z --provider openai --endpoint responses --request-id req_123 --error-code upstream_timeout --limit 250 --json`");
		expect(text).not.toContain("--since");
	});

	it("never suggests a terminal to hosted clients such as ChatGPT or claude.ai", async () => {
		for (const clientId of [undefined, "chatgpt_connector", "https://claude.ai/oauth/mcp-oauth-client-metadata"]) {
			expect(await callLogs(clientId, {})).toBe("List Phaseo request logs completed.");
		}
	});

	it("keeps agent input out of the suggested command unless it is a plain identifier", async () => {
		const text = await callLogs("phaseo_cli", { model: "x; rm -rf ~", provider: "--workspace=other", since: "$(id)" });
		expect(text).toContain("--since 7d --provider <provider-id> --model <model-id>");
		expect(text).not.toMatch(/rm -rf|--workspace|\$\(/);
	});
});

describe("management tool descriptions", () => {
	it("carry the confirm and no-retry rules on every tool that changes the workspace", () => {
		const changing = managementTools.filter((tool) => tool.effect !== "read");
		expect(changing.length).toBeGreaterThan(10);
		for (const tool of changing) {
			const description = managementToolDescription(tool);
			expect(description, tool.name).toMatch(/confirm/i);
			expect(description, tool.name).toContain("Never retry a failed change automatically.");
			expect(description.match(/confirm with the user first/gi)?.length ?? 0, tool.name).toBeLessThanOrEqual(1);
		}
		for (const tool of managementTools.filter((candidate) => candidate.effect === "read")) {
			expect(managementToolDescription(tool)).toBe(tool.description);
		}
	});
});
