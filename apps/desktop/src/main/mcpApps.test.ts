import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import type { McpConnection } from "../shared/mcp";
import { McpAppPages, mcpCallOf, mcpToolOf } from "./mcpApps";
import { mcpAppReply } from "../renderer/components/mcpAppHost";

const require = createRequire(import.meta.url);
const connection = (name: string, extra: Partial<McpConnection> = {}) => ({ id: "0b3c1a2e-5d6f-4a7b-8c9d-0e1f2a3b4c5d", name, enabled: true, transport: "stdio", executable: process.execPath, arguments: [], ...extra }) as McpConnection;

describe("MCP Apps", () => {
	it("finds the server and tool behind a step, however the agent names it", () => {
		const weather = connection("Weather");
		expect(mcpToolOf({ title: "mcp__phaseo_0b3c1a2e5d6f4a7b8c9d0e1f2a3b4c5d__forecast" }, [weather])).toEqual({ connection: weather, tool: "forecast" });
		expect(mcpToolOf({ title: "Weather · forecast" }, [weather])).toEqual({ connection: weather, tool: "forecast" });
		expect(mcpToolOf({ title: "Read" }, [weather])).toBeUndefined();
		expect(mcpCallOf({ text: "{\"city\":\"Leeds\"}\n\n{\"high\":14}" })).toEqual({ input: { city: "Leeds" }, result: { content: [{ type: "text", text: "{\"high\":14}" }], structuredContent: { high: 14 } } });
	});

	it("answers the page's handshake, then gives it the call, and declines acting for the person", () => {
		const call = { input: { city: "Leeds" }, result: { content: [] } };
		expect(mcpAppReply({ jsonrpc: "2.0", id: 1, method: "ui/initialize" }, call, "dark").replies[0]).toMatchObject({ id: 1, result: { hostContext: { theme: "dark" } } });
		expect(mcpAppReply({ jsonrpc: "2.0", method: "ui/notifications/initialized" }, call, "dark").replies.map(reply => (reply as { method: string }).method)).toEqual(["ui/notifications/tool-input", "ui/notifications/tool-result"]);
		expect(mcpAppReply({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 412.4 } }, call, "light").height).toBe(413);
		expect(mcpAppReply({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "delete_everything" } }, call, "light").replies[0]).toMatchObject({ id: 2, error: { code: -32601 } });
	});

	it("reads the ui:// page a tool names from its server, once", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-mcp-apps-"));
		try {
			const server = pathToFileURL(require.resolve("@modelcontextprotocol/sdk/server/mcp.js")).href, stdio = pathToFileURL(require.resolve("@modelcontextprotocol/sdk/server/stdio.js")).href;
			const script = path.join(directory, "server.mjs");
			writeFileSync(script, `import { McpServer } from ${JSON.stringify(server)};
import { StdioServerTransport } from ${JSON.stringify(stdio)};
const app = new McpServer({ name: "weather", version: "1.0.0" });
app.registerTool("forecast", { description: "Forecast", _meta: { ui: { resourceUri: "ui://weather/forecast.html" } } }, async () => ({ content: [{ type: "text", text: "Sunny" }] }));
app.registerTool("plain", { description: "No page" }, async () => ({ content: [{ type: "text", text: "Plain" }] }));
app.registerResource("forecast", "ui://weather/forecast.html", { mimeType: "text/html;profile=mcp-app" }, async uri => ({ contents: [{ uri: uri.href, mimeType: "text/html;profile=mcp-app", text: "<!doctype html><p>Forecast</p>" }] }));
await app.connect(new StdioServerTransport());
`);
			const pages = new McpAppPages(async value => value);
			const weather = connection("Weather", { arguments: [script] });
			expect(await pages.page(weather, "forecast")).toBe("<!doctype html><p>Forecast</p>");
			expect(await pages.page(weather, "plain")).toBeUndefined();
		} finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 60_000);
});
