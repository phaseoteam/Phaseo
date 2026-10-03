import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SecretVault } from "./secretVault";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { validateCommand } from "../shared/workspace";

function fixture() {
	const root = mkdtempSync(path.join(tmpdir(), "phaseo-account-management-")); const directory = path.join(root, "vault");
	const vault = new SecretVault(directory, { available: () => true, encrypt: value => Buffer.from(`encrypted:${value}`), decrypt: value => value.toString().slice(10) });
	return { root, directory, vault, runtime: new WorkspaceRuntime(root, undefined, vault) };
}

describe("account management", () => {
	it("rotates keys, retains linked tasks across archival and uses the new credential reference", async () => {
		const { root, directory, vault, runtime } = fixture();
		const fetcher = vi.fn(async () => new Response('data: {"choices":[{"delta":{"content":"Reply"}}]}\n\ndata: [DONE]\n\n')); vi.stubGlobal("fetch", fetcher);
		try {
			const state = await runtime.command({ type: "add-account", name: "API", harness: "phaseo", kind: "api", endpoint: "https://old.example.invalid/v1", apiKey: "old-key" }); const account = state.accounts[0];
			const tasks = await runtime.command({ type: "create-task", harness: "phaseo", model: "model", mode: "chat", accountId: account.id }); const id = tasks.tasks[0].id;
			await runtime.command({ type: "update-account", id: account.id, name: "Updated API", endpoint: "https://new.example.invalid/v1", apiKey: "new-key", archived: true });
			const updated = runtime.store.get().accounts[0]; expect(updated.secretId).not.toBe(account.id); expect(vault.get(updated.secretId!)).toBe("new-key"); expect(readdirSync(directory)).toEqual([`${updated.secretId}.credential`]);
			expect(JSON.stringify(runtime.store.get())).not.toMatch(/old-key|new-key/); expect(runtime.store.getTask(id).accountId).toBe(account.id);
			await expect(runtime.command({ type: "create-task", harness: "phaseo", model: "model", mode: "chat", accountId: account.id })).rejects.toThrow("Restore");
			await runtime.command({ type: "update-account", id: account.id, archived: false }); await runtime.command({ type: "send", id, text: "Start" });
			await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed"));
			expect(fetcher).toHaveBeenCalledWith("https://new.example.invalid/v1/chat/completions", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer new-key" }) }));
		} finally { await runtime.close(); vi.unstubAllGlobals(); rmSync(root, { recursive: true, force: true }); }
	});
	it("preserves the old credential and metadata if saving a key rotation fails", async () => {
		const { root, directory, vault, runtime } = fixture();
		try {
			const state = await runtime.command({ type: "add-account", name: "API", harness: "phaseo", kind: "api", endpoint: "https://old.example.invalid/v1", apiKey: "old-key" }); const account = state.accounts[0];
			vi.spyOn(runtime.store, "saveAccount").mockImplementationOnce(() => { throw new Error("Save failed"); });
			await expect(runtime.command({ type: "update-account", id: account.id, endpoint: "https://new.example.invalid/v1", apiKey: "new-key" })).rejects.toThrow("Save failed");
			expect(vault.get(account.id)).toBe("old-key"); expect(runtime.store.get().accounts[0].endpoint).toBe(account.endpoint); expect(readdirSync(directory)).toEqual([`${account.id}.credential`]);
		} finally { await runtime.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it("keeps native authentication under its native profile while allowing renaming", async () => {
		const { root, runtime } = fixture();
		try {
			const state = await runtime.command({ type: "add-account", name: "Native", harness: "codex", kind: "native" }); const account = state.accounts[0];
			await expect(runtime.command({ type: "update-account", id: account.id, apiKey: "not-native-auth" })).rejects.toThrow("native sign-in");
			await runtime.command({ type: "update-account", id: account.id, name: "Renamed" }); expect(runtime.store.get().accounts[0]).toMatchObject({ name: "Renamed", configDirectory: account.configDirectory, configured: false });
		} finally { await runtime.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it("blocks connection changes during execution while allowing a label change", async () => {
		const { root, runtime } = fixture(); const fetcher = vi.fn(async (_url, options) => new Response(new ReadableStream({ start(controller) { options.signal.addEventListener("abort", () => controller.error(new Error("Aborted")), { once: true }); } }))); vi.stubGlobal("fetch", fetcher);
		try {
			const state = await runtime.command({ type: "add-account", name: "API", harness: "phaseo", kind: "api", endpoint: "https://example.invalid/v1", apiKey: "key" }); const account = state.accounts[0];
			const tasks = await runtime.command({ type: "create-task", harness: "phaseo", model: "model", mode: "chat", accountId: account.id }); await runtime.command({ type: "send", id: tasks.tasks[0].id, text: "Start" }); await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
			await expect(runtime.command({ type: "update-account", id: account.id, apiKey: "new-key" })).rejects.toThrow("running tasks"); await runtime.command({ type: "update-account", id: account.id, name: "Renamed" });
		} finally { await runtime.close(); vi.unstubAllGlobals(); rmSync(root, { recursive: true, force: true }); }
	});
	it("applies endpoint and credential validation to account edits", () => {
		for (const endpoint of ["https://user:secret@example.invalid/v1", "http://public.example.invalid/v1", "https://example.invalid/v1?token=secret"]) expect(() => validateCommand({ type: "update-account", id: "id", endpoint })).toThrow();
		expect(validateCommand({ type: "update-account", id: "id", endpoint: "http://127.0.0.1:8080/v1" })).toMatchObject({ type: "update-account" }); expect(() => validateCommand({ type: "update-account", id: "id", archived: "yes" })).toThrow();
	});
});
