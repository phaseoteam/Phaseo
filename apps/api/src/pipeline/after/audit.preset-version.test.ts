import { describe, expect, it, vi } from "vitest";

const auditSuccessMock = vi.fn();

vi.mock("../audit", () => ({
	auditSuccess: (...args: any[]) => auditSuccessMock(...args),
	auditFailure: vi.fn(),
}));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: vi.fn(async () => undefined) }));

import { handleSuccessAudit } from "./audit";

function ctx(overrides: Record<string, unknown>) {
	return {
		requestId: "req_preset_1",
		workspaceId: "ws_1",
		endpoint: "chat.completions",
		capability: "text.generate",
		model: "openai/gpt-5.4",
		requestedModel: "@support-triage@production",
		stream: false,
		body: { messages: [{ role: "user", content: "hi" }] },
		rawBody: { messages: [{ role: "user", content: "hi" }] },
		meta: { requestId: "req_preset_1", apiKeyId: "key_1", apiKeyRef: "kid_1", apiKeyKid: "kid_1", authMethod: "api_key" },
		providers: [],
		pricing: {},
		gating: {
			key: { ok: true, reason: null, resetAt: null },
			keyLimit: { ok: true, reason: null, resetAt: null },
			credit: { ok: true, reason: null, resetAt: null },
		},
		...overrides,
	} as any;
}

async function persistedMetadata(context: any) {
	auditSuccessMock.mockReset();
	auditSuccessMock.mockResolvedValue(undefined);
	await handleSuccessAudit(
		context,
		{
			kind: "completed",
			upstream: new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
			provider: "openai",
			generationTimeMs: 10,
			bill: { cost_cents: 0, currency: "USD", usage: null, finish_reason: "stop" },
			mappedRequest: null,
			rawResponse: {},
		} as any,
		false,
		{ output_tokens: 1, total_tokens: 1 },
		0,
		0,
		"USD",
		"stop",
		200,
		"resp_1",
		{},
	);
	return auditSuccessMock.mock.calls[0][0].detailMetadata;
}

describe("handleSuccessAudit preset version metadata", () => {
	it("records which preset version served the request and the ref it pinned", async () => {
		const metadata = await persistedMetadata(ctx({
			preset: { id: "preset_1", name: "@support-triage", slug: "support-triage", config: {}, versionId: "version_2", versionLabel: "v2", ref: "production" },
			promptTemplate: { presetId: "preset_1", presetSlug: "support-triage", versionLabel: "v2", ref: "production", variableNames: ["ticket"], messageCount: 2 },
		}));
		expect(metadata.preset).toEqual({ id: "preset_1", slug: "support-triage", version_id: "version_2", version_label: "v2", ref: "production" });
		expect(metadata.prompt_template).toEqual({
			preset_id: "preset_1", preset_slug: "support-triage", version_label: "v2", ref: "production", variable_names: ["ticket"], message_count: 2,
		});
	});

	it("records the published version for unpinned requests and nothing without a preset", async () => {
		const unpinned = await persistedMetadata(ctx({
			preset: { id: "preset_1", name: "@support-triage", slug: "support-triage", config: {}, versionId: "version_3", versionLabel: "v3", ref: null },
		}));
		expect(unpinned.preset).toEqual({ id: "preset_1", slug: "support-triage", version_id: "version_3", version_label: "v3", ref: null });
		expect(unpinned.prompt_template).toBeNull();
		expect((await persistedMetadata(ctx({ requestedModel: "openai/gpt-5.4" }))).preset).toBeNull();
	});
});
