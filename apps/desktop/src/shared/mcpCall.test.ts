import { expect, it } from "vitest";
import type { McpConnection } from "./mcp";
import { mcpServerTool } from "./mcpCall";
import { mcpCallOf, mcpToolOf, toolResult } from "../main/mcpApps";

const server = "phaseo_0b3c1a2e5d6f4a7b8c9d0e1f2a3b4c5d";
const weather = { id: "0b3c1a2e-5d6f-4a7b-8c9d-0e1f2a3b4c5d", name: "Weather", enabled: true, transport: "stdio", executable: "node", arguments: [] } as McpConnection;

it("reads the server and tool however each agent writes an MCP tool's name", () => {
	for (const name of [`mcp__${server}__get_forecast`, `${server}_get_forecast`, `${server}.get_forecast`, `${server}/get_forecast`]) expect(mcpServerTool(name)).toEqual({ server, tool: "get_forecast" });
	expect(mcpServerTool("Read")).toBeUndefined();
	expect(mcpServerTool("mcp__github__create_issue")).toBeUndefined();
});

it("prefers the call an agent reported, with its own result, over the step's title and text", () => {
	const reported = { title: "get_forecast", text: "Sunny", mcpCall: { server, tool: "get_forecast", input: { city: "Leeds" }, result: { content: [{ type: "text", text: "Sunny" }], structuredContent: { high: 14 } } } };
	expect(mcpToolOf(reported, [weather])).toEqual({ connection: weather, tool: "get_forecast" });
	expect(mcpCallOf(reported)).toEqual({ input: { city: "Leeds" }, result: reported.mcpCall.result });
	expect(mcpToolOf({ title: `${server}_get_forecast` }, [weather])).toEqual({ connection: weather, tool: "get_forecast" });
});

it("shapes any reported result as a tool result", () => {
	expect(toolResult("Sunny")).toEqual({ content: [{ type: "text", text: "Sunny" }] });
	expect(toolResult({ high: 14 })).toEqual({ content: [{ type: "text", text: "{\"high\":14}" }], structuredContent: { high: 14 } });
	expect(toolResult(undefined, "from text")).toEqual({ content: [{ type: "text", text: "from text" }] });
});
