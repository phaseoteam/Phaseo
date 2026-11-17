import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executor } from "./index";
import {
	decryptFromModel,
	encryptForModel,
	encryptChatMessages,
	fetchAttestedModelKey,
	normalizePublicKey,
	resetVeniceE2EEAttestationCache,
} from "./e2ee";
import { installFetchMock, type FetchCall } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());
beforeEach(() => resetVeniceE2EEAttestationCache());

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** A stand-in for Venice's enclave: it holds the model key and speaks the documented wire format. */
function fakeEnclave() {
	const modelPrivateKey = secp256k1.utils.randomPrivateKey();
	const modelPublicKeyHex = toHex(secp256k1.getPublicKey(modelPrivateKey, false));
	return { modelPrivateKey, modelPublicKeyHex };
}

function buildArgs(stream = false): ExecutorExecuteArgs {
	return {
		ir: {
			model: "moonshotai/kimi-k3.1-pro",
			stream,
			messages: [
				{ role: "system", content: [{ type: "text", text: "Answer in one word." }] },
				{ role: "user", content: [{ type: "text", text: "Capital of France?" }] },
			],
		},
		requestId: "req_venice_e2ee",
		workspaceId: "team_test",
		providerId: "venice-e2ee",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		providerModelSlug: "e2ee-kimi-k3-1-pro-p",
		capabilityParams: [] as any,
		byokMeta: [],
		pricingCard: { rules: [] } as any,
		meta: { returnUpstreamRequest: true },
	} as ExecutorExecuteArgs;
}

async function sse(chunks: unknown[]): Promise<Response> {
	const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
	return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("Venice E2EE executor", () => {
	let calls: FetchCall[] = [];
	afterEach(() => {
		calls = [];
	});

	function installEnclave(enclave: ReturnType<typeof fakeEnclave>, attestation: (nonce: string) => Record<string, unknown> = (nonce) => ({
		verified: true,
		nonce,
		model: "e2ee-kimi-k3-1-pro-p",
		tee_provider: "test",
		signing_key: enclave.modelPublicKeyHex,
	})) {
		let lastAttestation: FetchCall | null = null;
		let lastChat: FetchCall | null = null;
		const seenPlaintext: string[] = [];
		const mock = installFetchMock([
			{
				match: (url) => url.startsWith("https://api.venice.example/api/v1/tee/attestation"),
				onRequest: (call) => {
					lastAttestation = call;
					calls.push(call);
				},
				response: async () => {
					const nonce = new URL(lastAttestation!.url).searchParams.get("nonce")!;
					return new Response(JSON.stringify(attestation(nonce)), { status: 200, headers: { "Content-Type": "application/json" } });
				},
			},
			{
				match: (url) => url === "https://api.venice.example/api/v1/chat/completions",
				onRequest: (call) => {
					lastChat = call;
					calls.push(call);
				},
				response: async () => {
					const body = lastChat!.bodyJson;
					for (const message of body.messages) {
						const plain = await decryptFromModel(message.content, enclave.modelPrivateKey);
						if (plain === null) throw new Error(`plaintext ${message.role} message reached Venice`);
						seenPlaintext.push(`${message.role}:${plain}`);
					}
					const clientPublic = normalizePublicKey(lastChat!.headers["x-venice-tee-client-pub-key"]!);
					return sse([
						{ id: "chatcmpl-e2ee", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: await encryptForModel("Par", clientPublic) } }] },
						{ id: "chatcmpl-e2ee", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: await encryptForModel("is", clientPublic) }, finish_reason: "stop" }] },
						{ id: "chatcmpl-e2ee", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 21, completion_tokens: 2, total_tokens: 23 } },
					]);
				},
			},
		]);
		return { mock, seenPlaintext };
	}

	it("encrypts the prompt for the attested enclave and decrypts the answer", async () => {
		const enclave = fakeEnclave();
		const { mock, seenPlaintext } = installEnclave(enclave);
		const result = await executor(buildArgs(false));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(calls.map((call) => new URL(call.url).pathname)).toEqual(["/api/v1/tee/attestation", "/api/v1/chat/completions"]);
		const attestationNonce = new URL(calls[0]!.url).searchParams.get("nonce");
		expect(attestationNonce).toMatch(/^[0-9a-f]{64}$/);
		const chat = calls[1]!;
		expect(chat.headers["x-venice-tee-model-pub-key"]).toBe(enclave.modelPublicKeyHex);
		expect(chat.headers["x-venice-tee-client-pub-key"]).toMatch(/^04[0-9a-f]{128}$/);
		expect(chat.headers["x-venice-tee-signing-algo"]).toBe("ecdsa");
		expect(chat.bodyJson.model).toBe("e2ee-kimi-k3-1-pro-p");
		expect(chat.bodyJson.stream).toBe(true);
		expect(chat.bodyText).not.toContain("Capital of France");
		expect(seenPlaintext).toEqual(["system:Answer in one word.", "user:Capital of France?"]);

		const ir = (result as any).ir;
		const text = ir.choices?.[0]?.message?.content
			?.map?.((part: any) => part.text ?? "")
			.join("") ?? JSON.stringify(ir);
		expect(text).toContain("Paris");
		expect(ir.usage).toMatchObject({ inputTokens: 21, outputTokens: 2 });
	});

	it("streams decrypted chunks to the caller", async () => {
		const enclave = fakeEnclave();
		const { mock } = installEnclave(enclave);
		const result = await executor(buildArgs(true));
		expect(result.kind).toBe("stream");
		const reader = (result as any).stream.getReader();
		let out = "";
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			out += new TextDecoder().decode(value);
		}
		mock.restore();
		expect(out).toContain("Par");
		expect(out).toContain("is");
		expect(out).not.toMatch(/[0-9a-f]{186,}/);
	});

	it("refuses to send the prompt when attestation is not verified", async () => {
		const enclave = fakeEnclave();
		const { mock } = installEnclave(enclave, (nonce) => ({ verified: false, nonce, signing_key: enclave.modelPublicKeyHex }));
		await expect(executor(buildArgs(false))).rejects.toThrow(/venice_e2ee_attestation_failed/);
		mock.restore();
		expect(calls.some((call) => call.url.endsWith("/chat/completions"))).toBe(false);
	});

	it("refuses a replayed attestation whose nonce does not match", async () => {
		const enclave = fakeEnclave();
		const { mock } = installEnclave(enclave, () => ({ verified: true, nonce: "00".repeat(32), signing_key: enclave.modelPublicKeyHex }));
		await expect(executor(buildArgs(false))).rejects.toThrow(/nonce mismatch/);
		mock.restore();
		expect(calls.some((call) => call.url.endsWith("/chat/completions"))).toBe(false);
	});

	it("reuses a verified attestation for a few minutes", async () => {
		const enclave = fakeEnclave();
		let attestations = 0;
		const fetchImpl = async (url: string) => {
			attestations += 1;
			const nonce = new URL(url).searchParams.get("nonce");
			return new Response(JSON.stringify({ verified: true, nonce, signing_key: enclave.modelPublicKeyHex }));
		};
		const input = { chatUrl: "https://api.venice.example/api/v1/chat/completions", model: "e2ee-glm-5-3-p", authorization: "Bearer k", fetchImpl };
		await fetchAttestedModelKey({ ...input, now: 1_000 });
		await fetchAttestedModelKey({ ...input, now: 1_000 + 60_000 });
		expect(attestations).toBe(1);
		await fetchAttestedModelKey({ ...input, now: 1_000 + 6 * 60_000 });
		expect(attestations).toBe(2);
	});
});

describe("Venice E2EE message encryption", () => {
	it("encrypts system, developer and user turns and leaves assistant and tool turns", async () => {
		const enclave = fakeEnclave();
		const body = await encryptChatMessages({
			model: "e2ee-glm-5-3-p",
			messages: [
				{ role: "developer", content: "Be brief." },
				{ role: "user", content: "hi" },
				{ role: "assistant", content: "hello" },
				{ role: "tool", tool_call_id: "c1", content: "42" },
			],
		}, normalizePublicKey(enclave.modelPublicKeyHex));
		expect(body.messages.map((m: any) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
		expect(await decryptFromModel(body.messages[0].content, enclave.modelPrivateKey)).toBe("Be brief.");
		expect(await decryptFromModel(body.messages[1].content, enclave.modelPrivateKey)).toBe("hi");
		expect(body.messages[2].content).toBe("hello");
		expect(body.messages[3].content).toBe("42");
	});

	it("rejects non-text parts instead of sending them in the clear", async () => {
		const enclave = fakeEnclave();
		await expect(encryptChatMessages({
			messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://example.com/a.png" } }] }],
		}, normalizePublicKey(enclave.modelPublicKeyHex))).rejects.toThrow(/venice_e2ee_unsupported_content/);
	});

	it("leaves hex-looking text that is not ciphertext for this client unchanged", async () => {
		const other = fakeEnclave();
		const notOurs = await encryptForModel("secret", normalizePublicKey(other.modelPublicKeyHex));
		expect(await decryptFromModel(notOurs, secp256k1.utils.randomPrivateKey())).toBeNull();
		expect(await decryptFromModel("deadbeef", other.modelPrivateKey)).toBeNull();
	});
});
