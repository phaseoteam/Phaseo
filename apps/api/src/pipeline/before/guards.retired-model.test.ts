import { beforeEach, describe, expect, it, vi } from "vitest";
import { guardContext } from "./guards";
import { fetchGatewayContext } from "./context";
import { findRetiredModelNotice } from "./retiredModels";

vi.mock("./context", () => ({
	fetchGatewayContext: vi.fn(),
}));

vi.mock("./retiredModels", async (importOriginal) => ({
	...(await importOriginal<typeof import("./retiredModels")>()),
	findRetiredModelNotice: vi.fn(),
}));

const fetchGatewayContextMock = vi.mocked(fetchGatewayContext);
const findRetiredModelNoticeMock = vi.mocked(findRetiredModelNotice);

function makeContext(providers: Array<{ providerId: string; supportsEndpoint: boolean }>) {
	return {
		workspaceId: "team_123",
		resolvedModel: "openai/gpt-3.5-turbo-0613",
		key: { ok: true, reason: null, resetAt: null },
		keyLimit: { ok: true, reason: null, resetAt: null },
		credit: { ok: true, reason: null, resetAt: null, balanceNanos: 1_000_000_000 },
		providers: providers.map((provider) => ({
			...provider,
			baseWeight: 1,
			byokMeta: [],
			providerModelSlug: null,
			capabilityParams: {},
		})),
		pricing: {},
		teamSettings: { billingMode: "wallet" },
	};
}

function guard() {
	return guardContext({
		workspaceId: "team_123",
		apiKeyId: "key_123",
		endpoint: "chat.completions",
		capability: "text.generate",
		model: "openai/gpt-3.5-turbo-0613",
		requestId: "req_retired_1",
	});
}

describe("guardContext for retired models", () => {
	beforeEach(() => {
		fetchGatewayContextMock.mockReset();
		findRetiredModelNoticeMock.mockReset();
	});

	it("returns 410 naming the suggested model when a retired model has no providers", async () => {
		fetchGatewayContextMock.mockResolvedValue(makeContext([]) as any);
		findRetiredModelNoticeMock.mockResolvedValue({
			model: "openai/gpt-3.5-turbo-0613",
			retiredAt: "2024-09-13T00:00:00+00:00",
			replacementModel: "openai/gpt-4o-mini",
		});

		const result = await guard();

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(410);
		const payload = await result.response.json();
		expect(payload).toMatchObject({
			code: "model_retired",
			error_type: "user",
			model: "openai/gpt-3.5-turbo-0613",
			retired_at: "2024-09-13T00:00:00+00:00",
			replacement_model: "openai/gpt-4o-mini",
		});
		expect(payload.description).toBe(
			'Model "openai/gpt-3.5-turbo-0613" was retired on 2024-09-13 and no provider serves it any more. Use "openai/gpt-4o-mini" instead.',
		);
		expect(findRetiredModelNoticeMock).toHaveBeenCalledWith("openai/gpt-3.5-turbo-0613");
	});

	it("keeps the unsupported model error for unknown or unretired models", async () => {
		fetchGatewayContextMock.mockResolvedValue(makeContext([]) as any);
		findRetiredModelNoticeMock.mockResolvedValue(null);

		const result = await guard();

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(400);
		expect((await result.response.json()).code).toBe("unsupported_model_or_endpoint");
	});

	it("does not look up lifecycle when providers exist but none support the endpoint", async () => {
		fetchGatewayContextMock.mockResolvedValue(
			makeContext([{ providerId: "openai", supportsEndpoint: false }]) as any,
		);

		const result = await guard();

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(400);
		expect(findRetiredModelNoticeMock).not.toHaveBeenCalled();
	});
});
