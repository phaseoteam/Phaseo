// Purpose: End-to-end text cases: failover, upstream error mapping, billing, BYOK, presets and dynamic routes.
// Why: These behaviours only exist when before, execute (attempt loop, credential plan) and after (finaliser) run together.
// How: Each case names its catalogue routes, client body and the scripted upstream behaviour per provider.

import type { UsageProfile } from "../../src/dialects";
import { BASIC } from "../../src/response-variants";
import type { CaseDef } from "../types";
import type { UpstreamBehaviour } from "../upstream";
import { OPENAI_STYLE_PROFILE, SURFACE, billingVariant, byokKey, route, textBody, type Surface } from "./shared";

const GPT_OSS = "openai/gpt-oss-120b";
const ORDER = ["deepinfra", "together", "groq"];
const FAILOVER_ROUTES = { [GPT_OSS]: [route("deepinfra", GPT_OSS), route("together", GPT_OSS), route("groq", GPT_OSS)] };

function chatCase(id: string, group: CaseDef["group"], description: string, upstream: Record<string, UpstreamBehaviour[]>, options: Partial<CaseDef> & { stream?: boolean; order?: string[] } = {}): CaseDef {
	const stream = options.stream ?? false;
	return {
		id,
		group,
		family: "text",
		surface: "chat",
		mode: stream ? "stream" : "buffered",
		endpoint: SURFACE.chat.endpoint,
		path: SURFACE.chat.path,
		capability: "text.generate",
		routesByModel: FAILOVER_ROUTES,
		body: textBody("chat", GPT_OSS, stream, { provider: { order: options.order ?? ORDER } }),
		upstream,
		description,
		...options,
	};
}

// ---------------------------------------------------------------------------
// 1. Failover across providers.
// ---------------------------------------------------------------------------

function failoverCases(): CaseDef[] {
	const ok: UpstreamBehaviour = { kind: "ok", variant: BASIC };
	const firstFails = (id: string, behaviour: UpstreamBehaviour, description: string, extra: Partial<CaseDef> & { stream?: boolean } = {}) =>
		chatCase(`failover.${id}-then-ok`, "failover", description, { deepinfra: [behaviour], together: [ok], groq: [ok] }, extra);
	return [
		firstFails("500", { kind: "status", status: 500 }, "First provider 500, second succeeds"),
		firstFails("502", { kind: "status", status: 502 }, "First provider 502, second succeeds"),
		firstFails("503", { kind: "status", status: 503 }, "First provider 503, second succeeds"),
		firstFails("529", { kind: "status", status: 529 }, "First provider 529 (overloaded), second succeeds"),
		firstFails("429-retry-after", { kind: "status", status: 429, retryAfter: "7" }, "First provider 429 with Retry-After: 7, second succeeds"),
		firstFails("400", { kind: "status", status: 400 }, "First provider 400, second succeeds"),
		firstFails("connection-error", { kind: "throw" }, "First provider fetch throws (connection reset), second succeeds"),
		firstFails("headers-timeout", { kind: "hang" }, "First provider never sends headers (300 ms deadline), second succeeds; streaming client", {
			stream: true,
			bindings: { GATEWAY_UPSTREAM_HEADERS_TIMEOUT_MS: "300" },
		}),
		firstFails("500-stream", { kind: "status", status: 500 }, "First provider 500, second succeeds; streaming client", { stream: true }),
		chatCase("failover.all-503", "failover", "All three providers return 503", {
			deepinfra: [{ kind: "status", status: 503 }], together: [{ kind: "status", status: 503 }], groq: [{ kind: "status", status: 503 }],
		}),
		chatCase("failover.all-fail-last-429", "failover", "503, 500, then 429 with Retry-After: 11 from the last provider", {
			deepinfra: [{ kind: "status", status: 503 }], together: [{ kind: "status", status: 500 }], groq: [{ kind: "status", status: 429, retryAfter: "11" }],
		}),
		chatCase("failover.midstream-stream", "failover", "First provider fails mid-stream after sending text; streaming client", {
			deepinfra: [{ kind: "midstream" }], together: [ok], groq: [ok],
		}, { stream: true }),
		chatCase("failover.midstream-buffered", "failover", "First provider fails mid-stream after sending text; buffered client", {
			deepinfra: [{ kind: "midstream" }], together: [ok], groq: [ok],
		}),
		chatCase("failover.midstream-responses-upstream-stream", "failover", "First provider (Responses upstream) fails mid-stream; streaming Chat client", {
			groq: [{ kind: "midstream" }], deepinfra: [ok], together: [ok],
		}, { stream: true, order: ["groq", "deepinfra", "together"], body: textBody("chat", GPT_OSS, true, { provider: { order: ["groq", "deepinfra", "together"] } }) }),
	];
}

// ---------------------------------------------------------------------------
// 2. Upstream error mapping, one provider per upstream dialect, no failover candidate.
// ---------------------------------------------------------------------------

const ERROR_PROVIDERS: Array<{ provider: string; model: string; surface: Surface; dialect: string }> = [
	{ provider: "deepinfra", model: GPT_OSS, surface: "chat", dialect: "openai-chat" },
	{ provider: "openai", model: "openai/gpt-5-mini", surface: "responses", dialect: "openai-responses" },
	{ provider: "anthropic", model: "anthropic/claude-sonnet-4.5", surface: "messages", dialect: "anthropic-messages" },
	{ provider: "google-vertex", model: "google/gemini-2.5-flash", surface: "chat", dialect: "gemini" },
];

export const ERROR_STATUSES = [400, 401, 403, 404, 408, 413, 422, 429, 500, 503, 529];

function errorCases(): CaseDef[] {
	const out: CaseDef[] = [];
	for (const target of ERROR_PROVIDERS) {
		for (const status of ERROR_STATUSES) {
			const behaviour: UpstreamBehaviour = status === 429 ? { kind: "status", status, retryAfter: "7" } : { kind: "status", status };
			out.push({
				id: `errors.${target.provider}.${status}`,
				group: "errors",
				family: "text",
				surface: target.surface,
				mode: "buffered",
				endpoint: SURFACE[target.surface].endpoint,
				path: SURFACE[target.surface].path,
				capability: "text.generate",
				routesByModel: { [target.model]: [route(target.provider, target.model)] },
				body: textBody(target.surface, target.model, false),
				upstream: { [target.provider]: [behaviour] },
				description: `${target.provider} (${target.dialect}) returns HTTP ${status}${status === 429 ? " with Retry-After: 7" : ""}`,
			});
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// 3. Billing end to end: one provider per dialect x surface x mode, usage-rich response.
// ---------------------------------------------------------------------------

// Each provider gets only the usage fields its spec documents (specs/<id>.json): DeepInfra documents no
// prompt/completion detail objects; OpenAI documents cached and reasoning tokens for gpt-5-mini.
export const BILLING_PROVIDERS: Array<{ provider: string; model: string; dialect: string; profile: UsageProfile }> = [
	{ provider: "deepinfra", model: GPT_OSS, dialect: "openai-chat", profile: {} },
	{ provider: "openai", model: "openai/gpt-5-mini", dialect: "openai-responses", profile: OPENAI_STYLE_PROFILE },
	{ provider: "anthropic", model: "anthropic/claude-sonnet-4.5", dialect: "anthropic-messages", profile: {} },
	{ provider: "google-vertex", model: "google/gemini-2.5-flash", dialect: "gemini", profile: {} },
];

function billingCases(): CaseDef[] {
	const out: CaseDef[] = [];
	for (const target of BILLING_PROVIDERS) {
		for (const surface of ["chat", "responses", "messages"] as Surface[]) {
			for (const stream of [true, false]) {
				out.push({
					id: `billing.${target.provider}.${surface}.${stream ? "stream" : "buffered"}`,
					group: "billing",
					family: "text",
					surface,
					mode: stream ? "stream" : "buffered",
					endpoint: SURFACE[surface].endpoint,
					path: SURFACE[surface].path,
					capability: "text.generate",
					routesByModel: { [target.model]: [route(target.provider, target.model)] },
					body: textBody(surface, target.model, stream),
					upstream: { [target.provider]: [{ kind: "ok", variant: billingVariant(target.profile) }] },
					description: `${target.provider} (${target.dialect}) usage with every documented field (cache read/write, reasoning where documented) via /v1/${surface === "chat" ? "chat/completions" : surface}, ${stream ? "streaming" : "buffered"}`,
				});
			}
		}
	}
	// Robustness: an OpenAI-compatible provider whose card has no cache rule reports cached_tokens anyway
	// (OpenAI's documented field; DeepInfra serves DeepSeek and other models with prompt caching).
	for (const stream of [true, false]) {
		out.push({
			id: `billing.deepinfra.chat.${stream ? "stream" : "buffered"}.unpriced-cache-field`,
			group: "billing",
			family: "text",
			surface: "chat",
			mode: stream ? "stream" : "buffered",
			endpoint: SURFACE.chat.endpoint,
			path: SURFACE.chat.path,
			capability: "text.generate",
			routesByModel: { [GPT_OSS]: [route("deepinfra", GPT_OSS)] },
			body: textBody("chat", GPT_OSS, stream),
			upstream: { deepinfra: [{ kind: "ok", variant: billingVariant(OPENAI_STYLE_PROFILE) }] },
			description: `DeepInfra returns prompt_tokens_details.cached_tokens although its card has no cached-read rule, ${stream ? "streaming" : "buffered"}`,
		});
	}
	return out;
}

// ---------------------------------------------------------------------------
// 4. BYOK vs managed credentials.
// ---------------------------------------------------------------------------

function byokCases(): CaseDef[] {
	const model = GPT_OSS;
	const byokRoute = (keys = [byokKey("deepinfra-0001")]) => ({ [model]: [route("deepinfra", model, { byok: keys })] });
	const base = (id: string, description: string, overrides: Partial<CaseDef>): CaseDef => ({
		id,
		group: "byok",
		family: "text",
		surface: "chat",
		mode: "buffered",
		endpoint: SURFACE.chat.endpoint,
		path: SURFACE.chat.path,
		capability: "text.generate",
		routesByModel: byokRoute(),
		body: textBody("chat", model, false),
		upstream: { deepinfra: [{ kind: "ok", variant: BASIC }] },
		description,
		...overrides,
	});
	const sonnet = "anthropic/claude-sonnet-4.5";
	return [
		base("byok.managed-baseline", "Managed key only (no BYOK key on the candidate)", { routesByModel: { [model]: [route("deepinfra", model)] } }),
		base("byok.priority-within-free-allowance", "Priority BYOK key; workspace at request 1,000 of the month (inside the 250,000 free requests)", { byokMonthlyCount: 1_000 }),
		base("byok.priority-fee-after-allowance", "Priority BYOK key; workspace past the 250,000 free requests, so the 2.5% fee applies", { byokMonthlyCount: 300_000 }),
		base("byok.priority-fee-stream", "Priority BYOK key past the allowance; streaming client", { byokMonthlyCount: 300_000, mode: "stream", body: textBody("chat", model, true) }),
		base("byok.failing-key-no-managed-fallback", "Priority BYOK key rejected with 401; workspace has managed fallback off", {
			upstream: { deepinfra: [{ kind: "status", status: 401 }, { kind: "ok", variant: BASIC }] },
			teamSettings: { byokFallbackEnabled: false },
		}),
		base("byok.failing-key-managed-fallback", "Priority BYOK key rejected with 401; workspace allows fallback to Phaseo credits", {
			upstream: { deepinfra: [{ kind: "status", status: 401 }, { kind: "ok", variant: BASIC }] },
			teamSettings: { byokFallbackEnabled: true },
		}),
		base("byok.rate-limited-quota-headers", "BYOK key rate limited (429, Retry-After and x-ratelimit-* headers)", {
			upstream: { deepinfra: [{ kind: "status", status: 429, retryAfter: "9" }] },
		}),
		{
			...base("byok.anthropic-fee-cache-usage", "Anthropic BYOK past the allowance with cache read/write usage on /v1/messages", { byokMonthlyCount: 300_000 }),
			surface: "messages",
			endpoint: SURFACE.messages.endpoint,
			path: SURFACE.messages.path,
			routesByModel: { [sonnet]: [route("anthropic", sonnet, { byok: [byokKey("anthropic-0001")] })] },
			body: textBody("messages", sonnet, false),
			upstream: { anthropic: [{ kind: "ok", variant: billingVariant() }] },
		},
	];
}

// ---------------------------------------------------------------------------
// 5. Presets and dynamic routes.
// ---------------------------------------------------------------------------

const PRESET = {
	id: "preset_sim_0001",
	name: "SIM preset",
	slug: "sim-preset",
	config: {
		defaultModel: GPT_OSS,
		systemPrompt: "SIM-PRESET-SYSTEM-0001 answer in one sentence",
		defaultParams: { temperature: 0.37, max_tokens: 777 },
	},
};

function routingCases(): CaseDef[] {
	const presetCase = (surface: Surface, id: string, description: string, extra: Record<string, unknown> = {}): CaseDef => ({
		id,
		group: "routing",
		family: "text",
		surface,
		mode: "buffered",
		endpoint: SURFACE[surface].endpoint,
		path: SURFACE[surface].path,
		capability: "text.generate",
		routesByModel: { [GPT_OSS]: [route("deepinfra", GPT_OSS)] },
		preset: PRESET,
		presetModel: "@sim-preset",
		body: textBody(surface, "@sim-preset", false, extra),
		upstream: { deepinfra: [{ kind: "ok", variant: BASIC }] },
		description,
	});
	const sonnet = "anthropic/claude-sonnet-4.5";
	// Only the provider-pinning case offers two routes for the target model, so ranking cannot reorder the others.
	const dynamic = (id: string, description: string, defaultAction: Record<string, unknown>, upstream: CaseDef["upstream"], body?: Record<string, unknown>): CaseDef => ({
		id,
		group: "routing",
		family: "text",
		surface: "chat",
		mode: "buffered",
		endpoint: SURFACE.chat.endpoint,
		path: SURFACE.chat.path,
		capability: "text.generate",
		routesByModel: {
			[sonnet]: [route("anthropic", sonnet)],
			[GPT_OSS]: Array.isArray(defaultAction.providerOnly)
				? [route("deepinfra", GPT_OSS), route("together", GPT_OSS)]
				: [route("deepinfra", GPT_OSS)],
		},
		dynamicRoute: { id: "droute_sim_0001", name: "SIM route", version: 1, config: { defaultAction, rules: [] } },
		body: body ?? textBody("chat", sonnet, false),
		upstream,
		description,
	});
	return [
		presetCase("chat", "preset.chat.system-and-defaults", "Preset adds a system prompt and default temperature/max_tokens on /v1/chat/completions"),
		presetCase("chat", "preset.chat.request-overrides-default", "Request temperature 0.91 must win over the preset default 0.37", { temperature: 0.91 }),
		presetCase("responses", "preset.responses.system-and-defaults", "Preset system prompt and defaults on /v1/responses"),
		presetCase("messages", "preset.messages.system-and-defaults", "Preset system prompt and defaults on /v1/messages"),
		dynamic("dynamic.model-override-provider-only", "Dynamic route replaces the model and pins the provider to together", { model: GPT_OSS, providerOnly: ["together"] }, {
			anthropic: [{ kind: "ok", variant: BASIC }], deepinfra: [{ kind: "ok", variant: BASIC }], together: [{ kind: "ok", variant: BASIC }],
		}),
		dynamic("dynamic.model-fallback-after-503", "Primary model's only provider returns 503; the route's fallback model is tried", { modelFallbacks: [GPT_OSS] }, {
			anthropic: [{ kind: "status", status: 503 }], deepinfra: [{ kind: "ok", variant: BASIC }], together: [{ kind: "ok", variant: BASIC }],
		}),
		dynamic("request.models-fallback-after-503", "Request-level `models` fallback after the primary returns 503", {}, {
			anthropic: [{ kind: "status", status: 503 }], deepinfra: [{ kind: "ok", variant: BASIC }], together: [{ kind: "ok", variant: BASIC }],
		}, textBody("chat", sonnet, false, { models: [GPT_OSS] })),
		dynamic("request.models-no-fallback-after-400", "Request-level `models` must not switch model after a 400", {}, {
			anthropic: [{ kind: "status", status: 400 }], deepinfra: [{ kind: "ok", variant: BASIC }], together: [{ kind: "ok", variant: BASIC }],
		}, textBody("chat", sonnet, false, { models: [GPT_OSS] })),
	].map((def) => (def.dynamicRoute && Object.keys((def.dynamicRoute.config as any).defaultAction).length === 0 ? { ...def, dynamicRoute: undefined } : def));
}

export function textCases(): CaseDef[] {
	return [...failoverCases(), ...errorCases(), ...billingCases(), ...byokCases(), ...routingCases()];
}
