// Purpose: Building blocks for end-to-end case definitions (routes, client bodies, response variants).
// Why: Case files stay declarative; the request and route shapes are written once.
// How: Helpers return plain objects consumed by e2e/runner.ts.

import type { ResponseVariant, UsageProfile } from "../../src/dialects";
import { UPSTREAM_REASONING, UPSTREAM_SIGNATURE, UPSTREAM_TEXT } from "../../src/response-variants";
import type { SimByokKey, SimRoute } from "../state";

export type Surface = "chat" | "responses" | "messages";

export const SURFACE: Record<Surface, { endpoint: string; path: string }> = {
	chat: { endpoint: "chat.completions", path: "/v1/chat/completions" },
	responses: { endpoint: "responses", path: "/v1/responses" },
	messages: { endpoint: "messages", path: "/v1/messages" },
};

export const PROMPT = "SIM-E2E-PROMPT-0001 what is the forecast for Lyon?";

export function route(providerId: string, apiModelId: string, extra: Partial<SimRoute> = {}): SimRoute {
	return { providerId, apiModelId, ...extra };
}

export function byokKey(id: string, routingMode: SimByokKey["routingMode"] = "priority"): SimByokKey {
	return { id, key: `sim-byok-${id}`, routingMode };
}

/** A minimal client body for a text surface. `provider.order` pins the attempt order so failover is deterministic. */
export function textBody(surface: Surface, model: string, stream: boolean, extra: Record<string, unknown> = {}): Record<string, unknown> {
	const base: Record<string, unknown> = { model, stream };
	if (surface === "chat") base.messages = [{ role: "user", content: PROMPT }];
	if (surface === "responses") base.input = PROMPT;
	if (surface === "messages") {
		base.max_tokens = 1024;
		base.messages = [{ role: "user", content: PROMPT }];
	}
	return { ...base, ...extra };
}

/** Plain text plus reasoning, with every usage field the dialect documents. */
export function billingVariant(usageProfile?: UsageProfile): ResponseVariant {
	return {
		id: "billing",
		text: UPSTREAM_TEXT,
		reasoning: { text: UPSTREAM_REASONING, signature: UPSTREAM_SIGNATURE },
		finish: "stop",
		usage: "max",
		usageProfile,
	};
}

/** OpenAI-style profile used for billing cases: nested cached reads and reasoning tokens, as OpenAI documents them. */
export const OPENAI_STYLE_PROFILE: UsageProfile = { nestedCached: true, reasoning: true };
