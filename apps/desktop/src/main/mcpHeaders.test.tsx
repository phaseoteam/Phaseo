import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { WorkspaceStore } from "./workspaceStore";
import { SecretVault } from "./secretVault";
import { validateMcpCommand, type McpConnection } from "../shared/mcp";
import { HeaderFields } from "../renderer/views/McpConnections";

const token = "Bearer owned-secret-token";
const http: McpConnection = { id: "00000000-0000-4000-8000-000000000002", name: "Remote", enabled: true, transport: "http", url: "https://example.test/mcp", secretHeaders: ["Authorization"] };
// Reversed bytes stand in for OS encryption, so a file holding the plain value would show up in the checks below.
const encryption = (available = true) => ({ available: () => available, encrypt: (value: string) => Buffer.from(value).reverse(), decrypt: (value: Buffer) => Buffer.from(value).reverse().toString() });
async function withRuntime(run: (runtime: WorkspaceRuntime, directory: string) => Promise<void>, available = true, factory?: ConstructorParameters<typeof WorkspaceRuntime>[1]) {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-mcp-headers-")), runtime = new WorkspaceRuntime(directory, factory, new SecretVault(path.join(directory, "credentials"), encryption(available)));
	try { await run(runtime, directory); } finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
}
const everywhere = (directory: string) => [readFileSync(path.join(directory, "workspace.sqlite")).toString("latin1"), ...readdirSync(path.join(directory, "credentials")).map(file => readFileSync(path.join(directory, "credentials", file)).toString("latin1"))].join("\n");

describe("MCP header secrets", () => {
	it("validates header names and values", () => {
		const save = (connection: unknown, headers?: unknown) => validateMcpCommand({ type: "save", connection, headers });
		expect(save(http, { Authorization: token })).toEqual({ type: "save", connection: http, headers: { Authorization: token } });
		expect(save({ ...http, secretHeaders: [] }).connection).not.toHaveProperty("secretHeaders");
		expect(save({ ...http, headers: { Authorization: token } }).connection).not.toHaveProperty("headers");
		for (const [connection, headers] of [[{ ...http, secretHeaders: ["Bad name"] }], [{ ...http, secretHeaders: ["Authorization", "authorization"] }], [http, { Authorization: "a\r\nInjected: 1" }], [http, { Other: "x" }], [http, { Authorization: "" }]]) expect(() => save(connection, headers)).toThrow();
	});

	it("keeps values in the vault, out of settings and windows, and fills them in for connecting", () => withRuntime(async (runtime, directory) => {
		const overview = await runtime.mcp({ type: "save", connection: http, headers: { Authorization: token } });
		expect(overview.mcpConnections).toEqual([http]);
		expect(JSON.stringify([overview, runtime.store.get(), runtime.store.getOverview(), runtime.store.getMcpConnections()])).not.toContain("owned-secret");
		expect(everywhere(directory)).not.toContain("owned-secret");
		expect((await runtime.resolvedMcpConnections())[0]).toMatchObject({ headers: { Authorization: token } });
		// A save without values (a toggle, a rename) keeps the stored one; a typed value adds or replaces one.
		await runtime.mcp({ type: "save", connection: { ...http, name: "Renamed" } });
		expect((await runtime.resolvedMcpConnections())[0]).toMatchObject({ name: "Renamed", headers: { Authorization: token } });
		await runtime.mcp({ type: "save", connection: { ...http, secretHeaders: ["Authorization", "X-Team"] }, headers: { "X-Team": "blue" } });
		expect((await runtime.resolvedMcpConnections())[0]).toMatchObject({ headers: { Authorization: token, "X-Team": "blue" } });
		await expect(runtime.mcp({ type: "save", connection: { ...http, secretHeaders: ["X-New"] } })).rejects.toThrow("Enter a value for the X-New header");
		// Disabled servers are not read.
		await runtime.mcp({ type: "save", connection: { ...http, enabled: false } });
		expect((await runtime.resolvedMcpConnections())[0]).not.toHaveProperty("headers");
		await runtime.mcp({ type: "save", connection: { ...http, secretHeaders: undefined } });
		expect((await runtime.resolvedMcpConnections())[0]).not.toHaveProperty("headers");
		expect(existsSync(path.join(directory, "credentials", `mcp-headers-${http.id}.credential`))).toBe(false);
	}));

	it("passes resolved headers to native harnesses", async () => {
		let release!: () => void; const turn = new Promise<void>(resolve => { release = resolve; });
		const factory = vi.fn(() => ({ run: async () => { await turn; }, cancel: async () => { release(); } }));
		await withRuntime(async runtime => {
			await runtime.mcp({ type: "save", connection: http, headers: { Authorization: token } });
			const task = (await runtime.command({ type: "create-task", harness: "claude", model: "default", mode: "code" })).tasks[0];
			await runtime.command({ type: "send", id: task.id, text: "Use tools" }); await vi.waitFor(() => expect(factory).toHaveBeenCalled());
			expect(factory.mock.calls[0]).toEqual(expect.arrayContaining([expect.arrayContaining([expect.objectContaining({ id: http.id, headers: { Authorization: token } })])]));
			release(); await vi.waitFor(() => expect(runtime.store.getTask(task.id).status).toBe("completed"));
		}, true, factory as never);
	});

	it("refuses header values without secure storage", () => withRuntime(async runtime => {
		await expect(runtime.mcp({ type: "save", connection: http, headers: { Authorization: token } })).rejects.toThrow("Secure credential storage is unavailable");
		expect(runtime.store.getMcpConnections()).toEqual([]);
		await runtime.mcp({ type: "save", connection: { ...http, secretHeaders: undefined } });
		expect(runtime.store.getMcpConnections()).toHaveLength(1);
	}, false));

	it("moves plaintext headers from earlier builds into the vault", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-mcp-headers-"));
		try {
			new WorkspaceStore(path.join(directory, "workspace.sqlite")).close();
			const raw = new DatabaseSync(path.join(directory, "workspace.sqlite"));
			raw.prepare("INSERT INTO mcp_connections (id, data) VALUES (?, ?)").run(http.id, JSON.stringify({ ...http, secretHeaders: undefined, headers: { Authorization: token } }));
			raw.close();
			const runtime = new WorkspaceRuntime(directory, undefined, new SecretVault(path.join(directory, "credentials"), encryption()));
			try {
				expect(JSON.stringify(runtime.store.getOverview())).not.toContain("owned-secret");
				await vi.waitFor(() => expect(runtime.store.getMcpConnections()).toEqual([http]));
				expect((await runtime.resolvedMcpConnections())[0]).toMatchObject({ headers: { Authorization: token } });
			} finally { await runtime.close(); }
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});

	it("shows saved header names without values", () => {
		const html = renderToStaticMarkup(<HeaderFields value={[{ name: "Authorization", value: "", saved: true }, { name: "X-Team", value: "", saved: false }]} onChange={() => {}} />);
		expect(html).toContain("Authorization"); expect(html).toContain("Saved · type to replace"); expect(html).toContain('type="password"');
	});
});
