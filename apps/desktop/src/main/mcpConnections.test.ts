import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { nativeMcpName, validateMcpCommand, type McpConnection } from "../shared/mcp";
import { OpenCodeMcp } from "./openCodeMcp";
import type { OpenCodeClient } from "@opencode/client";

const connection: McpConnection = { id: "00000000-0000-4000-8000-000000000001", name: "Fixture", enabled: true, transport: "stdio", executable: process.execPath, arguments: ["fixture.mjs"] };
describe("durable native MCP connections", () => {
	it("rejects unsafe URLs, shell shims, malformed IDs and credentials in durable settings", () => {
		for (const value of [null, { ...connection, id: "-".repeat(36) }, { ...connection, executable: "node" }, { ...connection, arguments: ["bad\0value"] }, { ...connection, transport: "http", url: "https://example.test/mcp?token=secret" }, { ...connection, transport: "http", url: "http://example.test/mcp" }]) expect(() => validateMcpCommand({ type: "save", connection: value })).toThrow();
		expect(validateMcpCommand({ type: "save", connection: { ...connection, environment: { SECRET: "never-store" } } }).connection).not.toHaveProperty("environment");
		expect(validateMcpCommand({ type: "save", connection: { ...connection, transport: "http", url: "http://127.0.0.1:1234/mcp" } }).connection).toMatchObject({ transport: "http" });
	});
	it("persists connections across restart and blocks changes affecting active native tasks", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-mcp-store-")); let runtime = new WorkspaceRuntime(directory); let release!: () => void;
		try {
			runtime.mcp({ type: "save", connection }); await runtime.close();
			const turn=new Promise<void>(resolve=>{release=resolve;}); const factory=vi.fn(()=>({run:async()=>{await turn;},cancel:async()=>{release();}})); runtime=new WorkspaceRuntime(directory,factory);
			expect(runtime.store.get().mcpConnections).toEqual([connection]); const task=(await runtime.command({type:"create-task",harness:"claude",model:"default",mode:"code"})).tasks[0]; await runtime.command({type:"send",id:task.id,text:"Use tools"}); await vi.waitFor(()=>expect(factory).toHaveBeenCalled());
			expect(factory.mock.calls[0]).toEqual(expect.arrayContaining([[connection]])); expect(()=>runtime.mcp({type:"save",connection:{...connection,enabled:false}})).toThrow("Stop affected tasks");
			release(); await vi.waitFor(()=>expect(runtime.store.getTask(task.id).status).toBe("completed")); runtime.mcp({type:"save",connection:{...connection,enabled:false,archived:true}}); expect(runtime.store.get().mcpConnections[0].archived).toBe(true);
		} finally { release?.(); await runtime.close(); rmSync(directory,{recursive:true,force:true}); }
	});
	it("serializes OpenCode setup, preserves native servers and removes archived managed overrides", async () => {
		const directory=mkdtempSync(path.join(tmpdir(),"phaseo-mcp-sync-")); const name=nativeMcpName(connection); let connected=false;
		const list=vi.fn(async()=>({data:[{name:"native-existing",status:{status:"connected"}},...(connected?[{name,status:{status:"connected"}}]:[])]})); const add=vi.fn(async()=>{connected=true;}); const remove=vi.fn(async()=>{connected=false;});
		const client={mcp:{list,add,remove,connect:vi.fn()}} as unknown as OpenCodeClient; const manager=new OpenCodeMcp(); const signal=new AbortController().signal;
		try { await Promise.all([manager.synchronize(client,"endpoint",directory,undefined,[connection],signal),manager.synchronize(client,"endpoint",directory,undefined,[connection],signal)]); expect(add).toHaveBeenCalledOnce(); expect(add.mock.calls[0]).toEqual(expect.arrayContaining([expect.objectContaining({server:name,config:expect.objectContaining({command:[process.execPath,"fixture.mjs"]})})]));
			await manager.synchronize(client,"endpoint",directory,undefined,[{...connection,archived:true}],signal); expect(remove).toHaveBeenCalledOnce(); expect(remove.mock.calls[0]).toEqual(expect.arrayContaining([expect.objectContaining({server:name})]));
		} finally { rmSync(directory,{recursive:true,force:true}); }
	});
	it("reports native sign-in needs without exposing server errors", async () => {
		const directory=mkdtempSync(path.join(tmpdir(),"phaseo-mcp-auth-")); const client={mcp:{list:async()=>({data:[{name:nativeMcpName(connection),status:{status:"needs_auth",error:"credential=secret"}}]}),add:async()=>{}}} as unknown as OpenCodeClient;
		try { await expect(new OpenCodeMcp().synchronize(client,"endpoint",directory,undefined,[connection],new AbortController().signal)).rejects.toThrow("needs native sign-in"); }
		finally { rmSync(directory,{recursive:true,force:true}); }
	});
});
