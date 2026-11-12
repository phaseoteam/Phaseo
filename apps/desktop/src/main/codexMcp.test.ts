import { describe, expect, it, vi } from "vitest";
import { codexMcpConfig, waitCodexMcp } from "./codexMcp";
import { nativeMcpName, type McpConnection } from "../shared/mcp";

const connection: McpConnection = { id: "12345678-1234-1234-1234-123456789abc", name: "Fixture", transport: "stdio", executable: "/fixture", arguments: [], enabled: true };

describe("Codex managed MCP", () => {
	it("disables managed connections outside the task scope and in chat", () => {
		const scoped = { ...connection, projectId: "other" };
		expect(codexMcpConfig([scoped], { projectId: "project", mode: "code" })).toEqual({ [`mcp_servers.${nativeMcpName(connection)}`]: { command: "/fixture", args: [], env: { ELECTRON_RUN_AS_NODE: "1" }, enabled: false } });
		expect(Object.values(codexMcpConfig([connection], { mode: "chat" }))[0].enabled).toBe(false);
		expect(Object.values(codexMcpConfig([connection], { mode: "plan" }))[0].enabled).toBe(true);
	});
	it("enables only the orchestration server in chat, with a timeout long enough for wait_thread", () => {
		const orchestration: McpConnection = { id: "12345678-1234-1234-1234-123456789abd", name: "Phaseo orchestration", enabled: true, orchestration: true, transport: "http", url: "http://127.0.0.1:1/mcp", headers: { Authorization: "Bearer owned" } };
		const config = codexMcpConfig([connection, orchestration], { mode: "chat" });
		expect(config[`mcp_servers.${nativeMcpName(connection)}`].enabled).toBe(false);
		expect(config[`mcp_servers.${nativeMcpName(orchestration)}`]).toEqual({ url: orchestration.url, http_headers: { Authorization: "Bearer owned" }, tool_timeout_sec: 3660, enabled: true });
	});
	it("asks only for its own servers by name, giving each call the rest of the 30 s deadline", async () => {
		// A server in the person's own Codex config that isn't signed in makes an unfiltered list take 9-21 s.
		const request = vi.fn().mockResolvedValue({ data: [{ name: nativeMcpName(connection), runtimeStatus: "connected" }] });
		await waitCodexMcp({ request }, "thread", [connection], new AbortController().signal);
		expect(request).toHaveBeenCalledOnce();
		expect(request).toHaveBeenCalledWith("mcpServerStatus/list", { threadId: "thread", serverName: nativeMcpName(connection), cursor: null, detail: "toolsAndAuthOnly" }, expect.any(Number));
		expect(request.mock.calls[0]![2]).toBeGreaterThan(25000);
	});
	it("follows the cursor when an older Codex ignores serverName and returns the whole list", async () => {
		const request = vi.fn().mockResolvedValueOnce({ data: [{ name: "foreign", runtimeStatus: "connected" }], nextCursor: "next" }).mockResolvedValueOnce({ data: [{ name: nativeMcpName(connection), runtimeStatus: "connected" }], nextCursor: null });
		await waitCodexMcp({ request }, "thread", [connection], new AbortController().signal);
		expect(request).toHaveBeenLastCalledWith("mcpServerStatus/list", { threadId: "thread", serverName: nativeMcpName(connection), cursor: "next", detail: "toolsAndAuthOnly" }, expect.any(Number));
	});
	it("rejects a repeated pagination cursor", async () => {
		const request = vi.fn().mockResolvedValue({ data: [], nextCursor: "same" });
		await expect(waitCodexMcp({ request }, "thread", [connection], new AbortController().signal)).rejects.toThrow("pagination");
	});
	it("rejects failed connections without exposing native diagnostics", async () => {
		const request = vi.fn().mockResolvedValue({ data: [{ name: nativeMcpName(connection), runtimeStatus: "authenticationRequired", toolsError: "secret diagnostic" }] });
		await expect(waitCodexMcp({ request }, "thread", [connection], new AbortController().signal)).rejects.toThrow("MCP server “Fixture” needs native sign-in.");
	});
	it("stops before asking when setup is cancelled", async () => {
		const request = vi.fn();
		const controller = new AbortController(); controller.abort();
		await expect(waitCodexMcp({ request }, "thread", [connection], controller.signal)).rejects.toThrow("cancelled"); expect(request).not.toHaveBeenCalled();
	});
});
