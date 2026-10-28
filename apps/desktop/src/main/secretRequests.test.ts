import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { redactSecrets, validateSecretAnswer, validateSecretRequest } from "../shared/secretRequests";
import type { SecretVault } from "./secretVault";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { threadTools } from "./threadTools";

function memoryVault() {
	const values = new Map<string, string>();
	return { values, vault: { available: () => true, set: async (id: string, value: string) => { values.set(id, value); }, get: async (id: string) => { const value = values.get(id); if (value === undefined) throw new Error("missing"); return value; }, remove: (id: string) => { values.delete(id); } } as unknown as SecretVault };
}

describe("secret request validation", () => {
	it("checks requests and answers, and redacts values from output", () => {
		expect(validateSecretRequest({ label: " Stripe key ", reason: "For the webhook test" })).toEqual({ label: "Stripe key", reason: "For the webhook test", placeholder: undefined, delivery: undefined, timeoutMs: 600_000 });
		expect(() => validateSecretRequest({ label: "x", reason: "y", delivery: "env" })).toThrow("delivery");
		expect(() => validateSecretRequest({ label: "", reason: "y" })).toThrow("label");
		expect(validateSecretAnswer(null)).toBeNull();
		expect(() => validateSecretAnswer("")).toThrow("Enter the secret");
		expect(redactSecrets("token=sk-live-123 again sk-live-123", ["sk-live-123"])).toBe("token=[secret] again [secret]");
	});
});

describe("secret requests in the runtime", () => {
	it("keeps the value in the vault and gives the agent a reference or a private file", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-secrets-")), { values, vault } = memoryVault();
		const runtime = new WorkspaceRuntime(directory, undefined, vault);
		try {
			const claude = (await runtime.command({ type: "create-task", harness: "claude", model: "default", mode: "code" })).tasks[0].id;
			const tools = runtime.threadTools(claude);
			expect(threadTools(tools).some(tool => tool.id === "request_secret")).toBe(true);
			const asked = tools.requestSecret!({ label: "Stripe key", reason: "To run the webhook test", delivery: "secretRef", timeoutMs: 60_000 });
			await vi.waitFor(() => expect(runtime.store.getTask(claude).secretRequests?.[0].status).toBe("pending"));
			const request = runtime.store.getTask(claude).secretRequests![0];
			await runtime.answerSecret(claude, request.id, "sk-live-123");
			const result = await asked;
			expect(result).toMatchObject({ status: "saved", secretRef: `secret-ref:${request.id}` });
			// The chat records the outcome only; the vault holds the value.
			expect(JSON.stringify(runtime.store.getTask(claude))).not.toContain("sk-live-123");
			expect(values.get(`secret-request-${request.id}`)).toContain("sk-live-123");
			expect(await runtime.resolveSecrets(claude, { STRIPE_KEY: `secret-ref:${request.id}` })).toEqual({ STRIPE_KEY: "sk-live-123" });
			await expect(runtime.answerSecret(claude, request.id, "again")).rejects.toThrow("no longer waiting");

			const codex = (await runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "code" })).tasks.find(task => task.id !== claude)!.id;
			await expect(runtime.resolveSecrets(codex, { STRIPE_KEY: `secret-ref:${request.id}` })).rejects.toThrow("another chat");
			const file = runtime.threadTools(codex).requestSecret!({ label: "Token", reason: "For the CLI", timeoutMs: 60_000 });
			await vi.waitFor(() => expect(runtime.store.getTask(codex).secretRequests?.[0]?.status).toBe("pending"));
			await runtime.answerSecret(codex, runtime.store.getTask(codex).secretRequests![0].id, "tok-456");
			const saved = await file;
			expect("file" in saved && readFileSync(saved.file, "utf8")).toBe("tok-456");

			const declined = runtime.threadTools(codex).requestSecret!({ label: "Other", reason: "Optional", timeoutMs: 60_000 });
			await vi.waitFor(() => expect(runtime.store.getTask(codex).secretRequests?.at(-1)?.status).toBe("pending"));
			await runtime.answerSecret(codex, runtime.store.getTask(codex).secretRequests!.at(-1)!.id, null);
			expect(await declined).toEqual({ status: "declined" });
			const controller = new AbortController(), cancelled = runtime.threadTools(codex).requestSecret!({ label: "Late", reason: "Cancelled", timeoutMs: 60_000 }, controller.signal);
			controller.abort();
			expect(await cancelled).toEqual({ status: "cancelled" });
			expect(runtime.store.getTask(codex).secretRequests!.at(-1)!.status).toBe("cancelled");
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);
});
