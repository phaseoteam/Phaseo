import { describe, expect, it, vi } from "vitest";
import { waitClaudeMcp } from "./claudeMcp";
import type { McpConnection } from "../shared/mcp";

const server: McpConnection={id:"00000000-0000-4000-8000-000000000001",name:"Fixture",enabled:true,transport:"http",url:"https://example.invalid/mcp"};
describe("Claude native MCP readiness",()=>{
	it("cancels an unresponsive status read without submitting any input",async()=>{
		const controller=new AbortController(); const mcpServerStatus=vi.fn(async()=>await new Promise<never>(()=>{})); const ready=waitClaudeMcp({mcpServerStatus},[server],controller.signal); const cancelled=expect(ready).rejects.toThrow("cancelled"); controller.abort(); await cancelled; expect(mcpServerStatus).toHaveBeenCalledOnce();
	});
});
