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
	it("reads every status page and waits for the exact managed connection", async () => {
		const request = vi.fn().mockResolvedValueOnce({ data: [{ name: "foreign", runtimeStatus: "connected" }], nextCursor: "next" }).mockResolvedValueOnce({ data: [{ name: nativeMcpName(connection), runtimeStatus: "connected" }], nextCursor: null });
		await waitCodexMcp({ request }, "thread", [connection], new AbortController().signal);
		expect(request).toHaveBeenLastCalledWith("mcpServerStatus/list", { threadId: "thread", cursor: "next", detail: "toolsAndAuthOnly", limit: 100 }, expect.any(Number));
	});
	it("rejects failed connections without exposing native diagnostics", async () => {
		const request = vi.fn().mockResolvedValue({ data: [{ name: nativeMcpName(connection), runtimeStatus: "authenticationRequired", toolsError: "secret diagnostic" }], nextCursor: null });
		await expect(waitCodexMcp({ request }, "thread", [connection], new AbortController().signal)).rejects.toThrow("MCP server “Fixture” needs native sign-in.");
	});
	it("rejects repeated pagination cursors and cancelled setup", async () => {
		const request = vi.fn().mockResolvedValue({ data: [], nextCursor: "same" });
		await expect(waitCodexMcp({ request }, "thread", [connection], new AbortController().signal)).rejects.toThrow("pagination");
		const controller = new AbortController(); controller.abort(); request.mockClear();
		await expect(waitCodexMcp({ request }, "thread", [connection], controller.signal)).rejects.toThrow("cancelled"); expect(request).not.toHaveBeenCalled();
	});
});
