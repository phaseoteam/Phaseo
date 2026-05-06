import { formatRoomError } from "@/lib/chat/formatRoomError";

export interface ErrorListSummarySource {
	provider?: string | null;
	error_code?: string | null;
	error_message?: string | null;
	error_payload?: Record<string, unknown> | null;
	provider_attempts?: Array<{
		provider?: string | null;
		outcome?: string | null;
		status?: number | null;
		status_text?: string | null;
		upstream_error_code?: string | null;
		upstream_error_message?: string | null;
	}>;
}

function normalizeNonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function summarizeProviderAttempts(
	row: ErrorListSummarySource,
): string | null {
	if (!Array.isArray(row.provider_attempts) || row.provider_attempts.length === 0) {
		return null;
	}

	const failedAttempt = row.provider_attempts.find((attempt) => {
		if (!attempt || typeof attempt !== "object") return false;
		if (normalizeNonEmptyString(attempt.upstream_error_code)) return true;
		if (typeof attempt.status === "number" && attempt.status >= 400) return true;
		if (normalizeNonEmptyString(attempt.upstream_error_message)) return true;
		const outcome = normalizeNonEmptyString(attempt.outcome);
		return outcome != null && outcome !== "success";
	});

	if (!failedAttempt) return null;

	const summaryCode =
		normalizeNonEmptyString(failedAttempt.upstream_error_code) ??
		(typeof failedAttempt.status === "number" && failedAttempt.status >= 400
			? `HTTP ${failedAttempt.status}`
			: null) ??
		normalizeNonEmptyString(failedAttempt.status_text) ??
		normalizeNonEmptyString(failedAttempt.outcome) ??
		normalizeNonEmptyString(failedAttempt.upstream_error_message);
	const provider =
		normalizeNonEmptyString(failedAttempt.provider) ??
		normalizeNonEmptyString(row.provider);
	const parts = [summaryCode, provider].filter(Boolean);
	return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatErrorListSummary(
	row: ErrorListSummarySource,
): string | null {
	const raw = row.error_payload
		? JSON.stringify(row.error_payload)
		: row.error_message?.trim();
	if (raw) {
		const formatted = formatRoomError(raw);
		const structuredParts = [
			formatted.providerFailureCategory?.trim() || null,
			formatted.providerFailureProvider?.trim() || null,
		].filter(Boolean);
		if (structuredParts.length > 0) return structuredParts.join(" · ");
		if (formatted.reason?.trim()) return formatted.reason.trim();
		if (formatted.upstreamError?.code?.trim()) {
			const upstreamParts = [
				formatted.upstreamError.code.trim(),
				row.provider?.trim() || null,
			].filter(Boolean);
			if (upstreamParts.length > 0) return upstreamParts.join(" · ");
		}
	}

	const attemptSummary = summarizeProviderAttempts(row);
	if (attemptSummary) return attemptSummary;

	const fallbackParts = [
		row.error_code?.trim() || null,
		row.provider?.trim() || null,
	].filter(Boolean);
	return fallbackParts.length > 0 ? fallbackParts.join(" · ") : null;
}
