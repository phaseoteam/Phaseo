import { describe, expect, it } from "vitest";
import { OrchestratorMcp } from "./orchestratorMcp";
import { piOrchestrationExtensionSource } from "./piOrchestrationExtension";

describe("Pi orchestration extension", () => {
	it("registers native tools and calls the authenticated desktop transport without embedding credentials", async () => {
		const server = new OrchestratorMcp();
		const session = await server.session({ list: () => [], read: () => { throw new Error("Outside scope"); }, delegate: async () => { throw new Error("Declined"); }, interrupt: async () => { throw new Error("Outside scope"); }, wait: async () => { throw new Error("Outside scope"); } }, async () => false);
		if (session.connection.transport !== "http") throw new Error("Expected HTTP");
		const tools: { name: string; execute: (id: string, args: unknown, signal: AbortSignal) => Promise<{ content: unknown[]; isError?: boolean }> }[] = [];
		try {
			const source = piOrchestrationExtensionSource.replace('import { Type } from "typebox";', "").replace("export default async function", "async function");
			const load = new Function("Type", "fetch", "process", source + "; return phaseoOrchestration;")({ Unsafe: (schema: unknown) => schema }, fetch, { env: { PHASEO_ORCHESTRATOR_URL: session.connection.url, PHASEO_ORCHESTRATOR_AUTH: session.connection.headers!.Authorization } });
			await load({ registerTool: (tool: typeof tools[number]) => tools.push(tool), on: () => {} });
			expect(tools).toHaveLength(14);
			expect(await tools.find(tool => tool.name === "mcp__phaseo__list_threads")!.execute("owned", {}, new AbortController().signal)).toMatchObject({ content: [{ type: "text", text: "[]" }] });
			expect(await tools.find(tool => tool.name === "mcp__phaseo__read_thread")!.execute("owned", { id: "unrelated" }, new AbortController().signal)).toMatchObject({ isError: true });
			expect(piOrchestrationExtensionSource).not.toContain(session.connection.headers!.Authorization);
		} finally { session.close(); await server.close(); }
	});
});
