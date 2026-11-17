import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executor } from "./index";
import {
	decryptFromModel,
	decryptingResponse,
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
	type Msg = { role: string; content?: string; tool_calls?: Array<{ function: { arguments: string } }>; reasoning_content?: string };

	it("encrypts the content of every turn, including assistant answers and tool results", async () => {
		const enclave = fakeEnclave();
		const body = await encryptChatMessages({
			model: "e2ee-glm-5-3-p",
			messages: [
				{ role: "developer", content: "Be brief." },
				{ role: "user", content: "hi" },
				{ role: "assistant", content: "hello", reasoning_content: "private chain of thought" },
				{ role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "f", arguments: "{\"q\":1}" } }] },
				{ role: "tool", tool_call_id: "c1", content: "42" },
			],
		}, normalizePublicKey(enclave.modelPublicKeyHex));
		const messages = body.messages as Msg[];
		expect(messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "assistant", "tool"]);
		const plain = await Promise.all([0, 1, 2, 4].map((i) => decryptFromModel(messages[i]!.content!, enclave.modelPrivateKey)));
		expect(plain).toEqual(["Be brief.", "hi", "hello", "42"]);
		// Reasoning echoed in history is not an encrypted field, so it is not sent at all.
		expect(messages[2]).not.toHaveProperty("reasoning_content");
		// A tool-call turn without content stays without content; Venice does not decrypt tool-call arguments.
		expect(messages[3]).not.toHaveProperty("content");
		expect(messages[3]!.tool_calls![0]!.function.arguments).toBe("{\"q\":1}");
		expect(JSON.stringify(body)).not.toMatch(/hello|Be brief|private chain/);
	});

	it("joins consecutive text parts exactly as written", async () => {
		const enclave = fakeEnclave();
		const body = await encryptChatMessages({
			messages: [{ role: "user", content: [{ type: "text", text: "pass" }, { type: "text", text: "word" }] }],
		}, normalizePublicKey(enclave.modelPublicKeyHex));
		expect(await decryptFromModel((body.messages as Msg[])[0]!.content!, enclave.modelPrivateKey)).toBe("password");
	});

	it("rejects non-text parts instead of sending them in the clear", async () => {
		const enclave = fakeEnclave();
		await expect(encryptChatMessages({
			messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://example.com/a.png" } }] }],
		}, normalizePublicKey(enclave.modelPublicKeyHex))).rejects.toThrow(/venice_e2ee_unsupported_content/);
	});

	it("refuses an unknown role instead of sending its content in the clear", async () => {
		const enclave = fakeEnclave();
		await expect(encryptChatMessages({ messages: [{ role: "function", content: "x" }] }, normalizePublicKey(enclave.modelPublicKeyHex)))
			.rejects.toThrow(/venice_e2ee_unsupported_content/);
	});

	it("leaves hex-looking text that is not ciphertext for this client unchanged", async () => {
		const other = fakeEnclave();
		const notOurs = await encryptForModel("secret", normalizePublicKey(other.modelPublicKeyHex));
		expect(await decryptFromModel(notOurs, secp256k1.utils.randomPrivateKey())).toBeNull();
		expect(await decryptFromModel("deadbeef", other.modelPrivateKey)).toBeNull();
	});
});

describe("Venice E2EE stream decryption", () => {
	function streamOf(chunks: Uint8Array[], onCancel?: (reason: unknown) => void): ReadableStream<Uint8Array> {
		let i = 0;
		return new ReadableStream<Uint8Array>({
			pull(controller) {
				if (i < chunks.length) controller.enqueue(chunks[i++]!);
				else controller.close();
			},
			cancel(reason) {
				onCancel?.(reason);
			},
		});
	}

	async function readAll(response: Response): Promise<string> {
		return await response.text();
	}

	it("decrypts events split across arbitrary byte boundaries, including inside a UTF-8 character", async () => {
		const client = secp256k1.utils.randomPrivateKey();
		const clientPublic = secp256k1.getPublicKey(client, false);
		const events = [
			{ choices: [{ index: 0, delta: { content: await encryptForModel("Grüße ", clientPublic) } }] },
			{ choices: [{ index: 0, delta: { content: await encryptForModel("aus Paris", clientPublic) }, finish_reason: "stop" }] },
		];
		const text = `${events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join("")}data: [DONE]\r\n\r\n`;
		const bytes = new TextEncoder().encode(text);
		// 7-byte slices split lines, JSON and (on the second event's plaintext replacement) multi-byte characters.
		const chunks: Uint8Array[] = [];
		for (let i = 0; i < bytes.length; i += 7) chunks.push(bytes.slice(i, i + 7));
		const upstream = new Response(streamOf(chunks), { headers: { "Content-Type": "text/event-stream" } });
		const out = await readAll(decryptingResponse(upstream, client));
		const contents = out.split("\n")
			.filter((line) => line.startsWith("data: {"))
			.map((line) => JSON.parse(line.slice(6)).choices[0].delta.content);
		expect(contents.join("")).toBe("Grüße aus Paris");
		expect(out).toContain("data: [DONE]\r");
		expect(out).toContain("\r\n\r\n");
	});

	it("passes malformed events through unchanged", async () => {
		const client = secp256k1.utils.randomPrivateKey();
		const body = "data: {not json\n\nevent: ping\n\ndata: [DONE]\n\n";
		const upstream = new Response(streamOf([new TextEncoder().encode(body)]), { headers: { "Content-Type": "text/event-stream" } });
		expect(await readAll(decryptingResponse(upstream, client))).toBe(body);
	});

	it("cancels the upstream body when the caller cancels", async () => {
		const client = secp256k1.utils.randomPrivateKey();
		let markCancelled!: (reason: unknown) => void;
		const upstreamCancelled = new Promise<unknown>((resolve) => {
			markCancelled = resolve;
		});
		const never = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("data: {\"choices\":[]}\n\n"));
			},
			cancel(reason) {
				markCancelled(reason);
			},
		});
		const upstream = new Response(never, { headers: { "Content-Type": "text/event-stream" } });
		const reader = decryptingResponse(upstream, client).body!.getReader();
		await reader.read();
		await reader.cancel("client went away");
		// The pipe forwards the cancel to its source asynchronously; the test hangs (and times out) if it never does.
		await expect(upstreamCancelled).resolves.toBe("client went away");
	});
});

describe("Venice E2EE pipeline timing", () => {
	it("returns the tracked upstream response so selected dispatch timing excludes the attestation", async () => {
		resetVeniceE2EEAttestationCache();
		const enclave = fakeEnclave();
		const tracked = new Map<Response, { dispatchAtMs: number; phase: string }>();
		let lastUrl = "";
		let lastHeaders = new Headers();
		const trackerFetch = async (input: RequestInfo | URL, init?: RequestInit, phase = "provider") => {
			lastUrl = String(input);
			lastHeaders = new Headers(init?.headers ?? {});
			let response: Response;
			if (lastUrl.includes("/tee/attestation")) {
				const nonce = new URL(lastUrl).searchParams.get("nonce");
				response = new Response(JSON.stringify({ verified: true, nonce, signing_key: enclave.modelPublicKeyHex }), { headers: { "Content-Type": "application/json" } });
			} else {
				const clientPublic = normalizePublicKey(lastHeaders.get("x-venice-tee-client-pub-key")!);
				response = await sse([
					{ id: "c", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: await encryptForModel("ok", clientPublic) }, finish_reason: "stop" }] },
					{ id: "c", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } },
				]);
			}
			tracked.set(response, { dispatchAtMs: phase === "provider" ? 2_000 : 1_000, phase });
			return response;
		};
		const args = {
			...buildArgs(false),
			upstreamTiming: { fetch: trackerFetch, timingFor: (r: Response) => tracked.get(r) as any },
		} as ExecutorExecuteArgs;
		const result = await executor(args);
		expect(result.kind).toBe("completed");
		expect(tracked.get(result.upstream)).toEqual({ dispatchAtMs: 2_000, phase: "provider" });
	});
});
