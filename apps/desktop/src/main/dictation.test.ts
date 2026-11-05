import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { WorkspaceRuntime } from "./workspaceRuntime";
import type { SecretVault } from "./secretVault";

it("transcribes dictation through the signed-in Phaseo account, and says when there is none", async () => {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-dictation-"));
	const vault = { available: async () => true, get: vi.fn(async () => "pk_test"), set: async () => {}, remove: async () => {} } as unknown as SecretVault;
	const runtime = new WorkspaceRuntime(directory, undefined, vault);
	try {
		await expect(runtime.transcribe(new Uint8Array([1, 2]), "audio/webm", "openai/whisper-large-v3-turbo")).rejects.toThrow("Sign in to Phaseo to dictate");
		runtime.store.saveAccount({ id: "phaseo", name: "Phaseo", harness: "phaseo", kind: "api", endpoint: "https://api.phaseo.app/v1/", configured: true, secretId: "phaseo-key" });
		const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
			const form = init.body as FormData;
			expect(form.get("model")).toBe("openai/whisper-large-v3-turbo");
			expect((form.get("file") as File).name).toBe("dictation.webm");
			return new Response(JSON.stringify({ text: " Fix the login page. " }));
		});
		expect(await runtime.transcribe(new Uint8Array([1, 2]), "audio/webm", "openai/whisper-large-v3-turbo", fetcher as unknown as typeof fetch)).toBe("Fix the login page.");
		expect(fetcher.mock.calls[0][0]).toBe("https://api.phaseo.app/v1/audio/transcriptions");
		expect((fetcher.mock.calls[0][1].headers as Record<string, string>).authorization).toBe("Bearer pk_test");
		const refused = (async () => new Response(JSON.stringify({ error: { message: "Insufficient credits" } }), { status: 402 })) as unknown as typeof fetch;
		await expect(runtime.transcribe(new Uint8Array([1]), "audio/webm", "openai/whisper-large-v3-turbo", refused)).rejects.toThrow("Transcription failed (402): Insufficient credits");
	} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
});
