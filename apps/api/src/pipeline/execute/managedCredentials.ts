// Purpose: Know before routing whether the gateway's own (managed) credential can serve a provider.
// Why: A provider with no managed key in the Worker, or whose managed account is out of
//      credit, fails every managed attempt. Routing used to pick it anyway, so each request
//      paid a failed attempt (and requests with no other route failed).
// How: Text routes on the OpenAI-compatible executor read their managed key from Worker
//      bindings, so resolving it with no BYOK key is a cheap, local check. A 402 on the
//      managed key starts a short provider-wide cooldown in this isolate. Both apply to
//      managed attempts only: a customer's own key still reaches the provider.

import { normalizeCapability, textExecutorUsesOpenAICompatKey } from "@/executors";
import { normalizeProviderId } from "@/lib/config/providerAliases";
import { resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import type { ProviderCandidate } from "../before/types";
import { err, json } from "./http";
import { buildSafeStealthUpstreamError, isStealthRequest } from "../stealth";

export type ManagedCredentialState = "available" | "missing" | "payment_required";

// Long enough to stop an unfunded account taking every request, short enough that a
// top-up is picked up within minutes without a deploy.
export const MANAGED_PAYMENT_COOLDOWN_MS = 5 * 60_000;
const MAX_COOLDOWN_ENTRIES = 500;
const paymentCooldownUntil = new Map<string, number>();

function managedKeyMissing(providerId: string, capability: string): boolean {
	// Other capabilities and executors read credentials this check cannot see
	// (SigV4, OAuth, per-capability env vars), so they are never judged missing.
	if (normalizeCapability(capability) !== "text.generate") return false;
	if (!textExecutorUsesOpenAICompatKey(providerId)) return false;
	try {
		resolveOpenAICompatKey({ providerId, byokMeta: [], forceGatewayKey: true } as any);
		return false;
	} catch (error) {
		// The resolver reads the base URL before the key for some providers (Cloudflare needs
		// CLOUDFLARE_ACCOUNT_ID or a gateway URL), so a missing base URL hides whether the key
		// is set. Either way the executor throws the same error on every managed attempt.
		const code = (error as { code?: unknown } | null)?.code;
		return typeof code === "string" && (code.endsWith("_key_missing") || code.endsWith("_base_url_missing"));
	}
}

/** Whether the gateway's own credential can be used for this provider and capability now. */
export function managedCredentialState(
	providerId: string,
	capability: string,
	now: number = Date.now(),
): ManagedCredentialState {
	const key = normalizeProviderId(providerId);
	const until = paymentCooldownUntil.get(key);
	if (until !== undefined) {
		if (until > now) return "payment_required";
		paymentCooldownUntil.delete(key);
	}
	return managedKeyMissing(providerId, capability) ? "missing" : "available";
}

/**
 * Records a 402 on the gateway's own key. The provider account has no balance, so every
 * managed request to the provider fails the same way until it is topped up. BYOK 402s
 * describe one customer's account and must not be recorded here.
 */
export function recordManagedPaymentRequired(providerId: string, now: number = Date.now()): void {
	const key = normalizeProviderId(providerId);
	paymentCooldownUntil.delete(key);
	if (paymentCooldownUntil.size >= MAX_COOLDOWN_ENTRIES) {
		paymentCooldownUntil.delete(paymentCooldownUntil.keys().next().value!);
	}
	paymentCooldownUntil.set(key, now + MANAGED_PAYMENT_COOLDOWN_MS);
}

export function resetManagedCredentialStateForTests(): void {
	paymentCooldownUntil.clear();
}

/** Whether a managed (gateway) attempt on this candidate can succeed. */
export function canUseManagedCredential(candidate: ProviderCandidate, capability: string, now?: number): boolean {
	// Private endpoints authenticate with the workspace's own credential.
	if (candidate.privateEndpoint) return true;
	return managedCredentialState(candidate.providerId, capability, now) === "available";
}

export type ManagedCredentialSkip = { providerId: string; reason: Exclude<ManagedCredentialState, "available"> };

/**
 * Drops candidates that have neither a usable managed credential nor a BYOK key for this
 * request. BYOK-only routes are left to the credential plan, which reports them.
 */
export function filterCandidatesByCredential(
	candidates: ProviderCandidate[],
	capability: string,
	now: number = Date.now(),
): { candidates: ProviderCandidate[]; skipped: ManagedCredentialSkip[] } {
	const kept: ProviderCandidate[] = [];
	const skipped: ManagedCredentialSkip[] = [];
	for (const candidate of candidates) {
		if (
			candidate.privateEndpoint ||
			candidate.credentialMode === "byok_only" ||
			(candidate.byokMeta ?? []).length > 0
		) {
			kept.push(candidate);
			continue;
		}
		const state = managedCredentialState(candidate.providerId, capability, now);
		if (state === "available") kept.push(candidate);
		else skipped.push({ providerId: candidate.providerId, reason: state });
	}
	return { candidates: kept, skipped };
}

const CREDENTIALS_NOT_CONFIGURED_HINT =
	"Provider credentials are not configured for this route. Verify gateway keys or the selected BYOK configuration before retrying.";

/**
 * The response when every candidate was dropped for want of a credential. It keeps the
 * shapes a late failure produced: `provider_payment_required` when a managed account is
 * out of credit, otherwise `upstream_error` with a `*_key_missing` reason.
 */
export function managedCredentialUnavailableResponse(
	ctx: { model: string; requestedModel?: unknown; endpoint: string; requestId?: string | null },
	skipped: ManagedCredentialSkip[],
): Response {
	const providers = Array.from(new Set(skipped.map((entry) => entry.providerId)));
	const unpaid = skipped.find((entry) => entry.reason === "payment_required")?.providerId ?? null;
	if (isStealthRequest(ctx)) {
		// Stealth models never name their providers.
		const status = unpaid ? 402 : 502;
		return json(buildSafeStealthUpstreamError({
			status,
			model: ctx.model,
			endpoint: ctx.endpoint,
			requestId: ctx.requestId ?? "",
			keySource: "gateway",
		}), status);
	}
	if (unpaid) {
		return err("provider_payment_required", {
			reason: "upstream_provider_payment_required",
			description: `Oops, we forgot to pay our provider bills (${unpaid}). Please let us know on GitHub or Discord if you see this error.`,
			model: ctx.model,
			endpoint: ctx.endpoint,
			request_id: ctx.requestId,
			attempt_count: 0,
			skipped_providers: providers,
			provider_payment_required_provider: unpaid,
			provider_payment_required_support_notice: "Please let us know on GitHub or Discord if you see this error.",
		});
	}
	return err("upstream_error", {
		reason: providers.length === 1 ? `${providers[0]}_key_missing` : "provider_key_missing",
		description: `No provider for model "${ctx.model}" has credentials configured. Add a BYOK key for one of: ${providers.join(", ")}.`,
		model: ctx.model,
		endpoint: ctx.endpoint,
		request_id: ctx.requestId,
		attempt_count: 0,
		skipped_providers: providers,
		provider_failure_diagnostics: {
			category: "credentials_not_configured",
			hint: CREDENTIALS_NOT_CONFIGURED_HINT,
			provider: providers.length === 1 ? providers[0] : null,
		},
	});
}
