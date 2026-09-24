import type { ExecutorResult } from "../types";
import type { NormalizedProviderErrorCode, ProviderErrorIR } from "../provider-error-types";

const NOVITA_ERROR_CODES: Record<string, NormalizedProviderErrorCode> = {
	NOT_ENOUGH_BALANCE: "provider_payment_required",
	INSUFFICIENT_BALANCE: "provider_payment_required",
	INSUFFICIENT_FUNDS: "provider_payment_required",
	INVALID_REQUEST_BODY: "provider_request_rejected",
	RATE_LIMIT_EXCEEDED: "provider_capacity_exhausted",
	TOKEN_LIMIT_EXCEEDED: "provider_capacity_exhausted",
	SERVICE_NOT_AVAILABLE: "provider_service_unavailable",
};

function normalizeCode(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
	return normalized || null;
}

export function mapNovitaErrorCode(value: unknown): NormalizedProviderErrorCode | null {
	const code = normalizeCode(value);
	return code ? NOVITA_ERROR_CODES[code] ?? null : null;
}

function modelPageUrl(model: string): string {
	const parts = model.trim().split("/");
	if (parts.length !== 2 || parts.some((part) => !/^[a-z0-9._-]+$/i.test(part))) {
		return "https://phaseo.app/models";
	}
	return `https://phaseo.app/models/${parts.map(encodeURIComponent).join("/")}`;
}

function classifyNovitaError(payload: unknown, model: string): ProviderErrorIR | null {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
	const body = payload as Record<string, unknown>;
	const nested = body.error && typeof body.error === "object" && !Array.isArray(body.error)
		? body.error as Record<string, unknown>
		: null;
	const reason = body.reason ?? nested?.reason ?? body.error_code ?? nested?.code ?? body.code;
	const message = typeof body.message === "string"
		? body.message
		: typeof nested?.message === "string" ? nested.message : "";
	if (
		normalizeCode(reason) === "INVALID_REQUEST_BODY" &&
		/structured outputs?/i.test(message) &&
		/(?:not support|unsupported)/i.test(message)
	) {
		const helpUrl = modelPageUrl(model);
		return {
			code: "provider_feature_unsupported",
			message: "Structured outputs are not supported by this model.",
			action: `Review supported parameters here: ${helpUrl}`,
			helpUrl,
		};
	}
	const code = mapNovitaErrorCode(reason);
	return code ? { code } : null;
}

/** Attach Novita's meaning before the shared gateway handles the failed result. */
export async function withNovitaError(
	result: ExecutorResult,
	model: string,
): Promise<ExecutorResult> {
	if (result.upstream.ok) return result;
	const payload = await result.upstream.clone().json().catch(() => null);
	const providerError = classifyNovitaError(payload, model);
	return providerError ? { ...result, providerError } : result;
}
