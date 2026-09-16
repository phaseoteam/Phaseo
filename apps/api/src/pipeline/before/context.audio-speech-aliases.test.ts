import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => {
	const cache = {
		get: vi.fn(async () => null),
		put: vi.fn(async () => undefined),
		delete: vi.fn(async () => undefined),
	};

	const rpc = vi.fn(async (_name: string, args: { endpoint: string; model: string }) => {
		const provider = args.model === "spacex-ai/grok-tts" ? "spacex-ai" : "openai";
		const providerModelSlug = provider === "spacex-ai" ? "grok-tts" : "gpt-4o-mini-tts";
		return {
			data: [{
				workspace_id: "ws_audio_alias",
				resolved_model: args.model,
				key_ok: { ok: true, reason: null },
				key_limit_ok: { ok: true, reason: null },
				credit_ok: { ok: true, reason: null },
				providers: args.endpoint === "audio/speech" ? [{
					provider_id: provider,
					api_model_id: args.model,
					pricing_key: provider,
					provider_status: "active",
					provider_routing_status: "active",
					model_status: "active",
					capability_status: "active",
					provider_model_slug: providerModelSlug,
					input_modalities: ["text"],
					output_modalities: ["audio"],
					supports_endpoint: true,
					base_weight: 1,
					byok_meta: [],
					capability_params: {},
					max_input_tokens: null,
					max_output_tokens: null,
				}] : [],
				pricing: {},
			}],
			error: null,
		};
	});

	const from = vi.fn((table: string) => {
        if (table === "v2_model_provider_routes") {
            const q: any = { select: () => q, eq: () => q, in: () => q, then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve) };
            return q;
        }
		if (table === "v2_providers") {
			return {
				select: () => ({
					in: async () => ({ data: [], error: null }),
				}),
			};
		}
		if (table === "workspace_settings") {
			return {
				select: () => ({
					eq: () => ({
						maybeSingle: async () => ({
							data: {
								routing_mode: "balanced",
								byok_fallback_enabled: true,
								beta_channel_enabled: false,
								alpha_channel_enabled: false,
								cache_aware_routing_enabled: true,
							},
							error: null,
						}),
					}),
				}),
			};
		}
		if (table === "workspaces") {
			return {
				select: () => ({
					eq: () => ({
						maybeSingle: async () => ({ data: { billing_mode: "wallet" }, error: null }),
					}),
				}),
			};
		}
		throw new Error(`Unexpected table: ${table}`);
	});

	return { cache, supabase: { rpc, from } };
});

const loadPriceCardMock = vi.hoisted(() => vi.fn());

vi.mock("@/runtime/env", () => ({
	getCache: () => runtime.cache as unknown as KVNamespace,
	getSupabaseAdmin: () => runtime.supabase,
}));

vi.mock("@pipeline/pricing", () => ({
	loadPriceCard: (...args: any[]) => loadPriceCardMock(...args),
}));

describe("fetchGatewayContext audio speech capability aliases", () => {
	beforeEach(() => {
		runtime.cache.get.mockClear();
		runtime.cache.put.mockClear();
		runtime.cache.delete.mockClear();
		runtime.supabase.rpc.mockClear();
		runtime.supabase.from.mockClear();
		loadPriceCardMock.mockReset();
		loadPriceCardMock.mockResolvedValue({
			currency: "USD",
			rules: [{ meter: "input_characters" }],
		});
		vi.resetModules();
	});

	it.each([
		["openai/gpt-4o-mini-tts", "openai"],
		["spacex-ai/grok-tts", "spacex-ai"],
	])("resolves slash-form TTS capability rows for %s", async (model, providerId) => {
		const { fetchGatewayContext } = await import("./context");
		const context = await fetchGatewayContext({
			workspaceId: "ws_audio_alias",
			model,
			endpoint: "audio.speech",
			apiKeyId: "key_audio_alias",
			disableCache: true,
		});

		expect(context.providers).toEqual([
			expect.objectContaining({
				providerId,
				apiModelId: model,
				supportsEndpoint: true,
			}),
		]);
		expect(runtime.supabase.rpc.mock.calls.map(([, args]) => args.endpoint)).toEqual([
			"audio.speech",
			"audio/speech",
		]);
	});
});
