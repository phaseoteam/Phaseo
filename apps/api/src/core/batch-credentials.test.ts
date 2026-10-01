import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mode: "managed_and_byok", rows: [] as any[] }));
const decryptMock = vi.hoisted(() => vi.fn(async (row: any) => new TextEncoder().encode(`secret:${row.id}`)));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({ OPENAI_API_KEY: "managed-key" }),
	getSupabaseAdmin: () => ({
		from: (table: string) => {
			const chain: any = {
				select: () => chain,
				eq: () => chain,
				limit: async () => ({ data: state.rows, error: null }),
				maybeSingle: async () => table === "v2_providers"
					? { data: { credential_mode: state.mode }, error: null }
					: { data: state.rows[0] ?? null, error: null },
			};
			return chain;
		},
	}),
}));
vi.mock("@pipeline/byok/decrypt", () => ({
	decryptBYOK: decryptMock,
	bytesToString: (bytes: Uint8Array) => new TextDecoder().decode(bytes),
}));
vi.mock("@providers/openai-compatible/config", () => ({
	resolveOpenAICompatKey: () => ({ key: "managed-key" }),
}));
vi.mock("@providers/keys", () => ({ resolveProviderKey: () => ({ key: "managed-key" }) }));
vi.mock("@/core/byok", () => ({
	BYOK_KEYS_PER_PROVIDER_LIMIT: 32,
	isByokKeyEligible: () => true,
}));

import { resolveBatchSubmissionCredential } from "./batch-credentials";

describe("batch credential routing", () => {
	beforeEach(() => {
		state.mode = "managed_and_byok";
		state.rows = [];
		decryptMock.mockClear();
	});

	it("uses priority BYOK before managed credentials", async () => {
		state.rows = [{ id: "byok-priority", provider_id: "openai", routing_mode: "priority", sort_order: 0 }];
		await expect(resolveBatchSubmissionCredential({ workspaceId: "ws", providerId: "openai", apiKeyId: "key", model: "gpt" }))
			.resolves.toMatchObject({ credential: { source: "byok", byokKeyId: "byok-priority" } });
	});

	it("uses managed credentials before fallback BYOK", async () => {
		state.rows = [{ id: "byok-fallback", provider_id: "openai", routing_mode: "fallback", sort_order: 0 }];
		await expect(resolveBatchSubmissionCredential({ workspaceId: "ws", providerId: "openai", apiKeyId: "key", model: "gpt" }))
			.resolves.toMatchObject({ credential: { source: "gateway", byokKeyId: null } });
	});

	it("requires BYOK for BYOK-only providers and accepts fallback-mode keys", async () => {
		state.mode = "byok_only";
		await expect(resolveBatchSubmissionCredential({ workspaceId: "ws", providerId: "openai", apiKeyId: "key", model: "gpt" }))
			.rejects.toThrow("byok_credentials_required");
		state.rows = [{ id: "byok-only", provider_id: "openai", routing_mode: "fallback", sort_order: 0 }];
		await expect(resolveBatchSubmissionCredential({ workspaceId: "ws", providerId: "openai", apiKeyId: "key", model: "gpt" }))
			.resolves.toMatchObject({ credential: { source: "byok", byokKeyId: "byok-only" } });
	});
});
