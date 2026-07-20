type AsyncJobFailureDiagnosticsRoot = Record<string, unknown> | null | undefined;

export interface AsyncJobUpstreamErrorRow {
	code: string | null;
	type: string | null;
	message: string | null;
	description: string | null;
	param: string | null;
	status: number | null;
}

export interface AsyncJobProviderFailureDiagnosticsRow {
	category: string | null;
	provider: string | null;
	hint: string | null;
}

export interface AsyncJobFailureSampleRow {
	provider: string | null;
	type: string | null;
	status: number | null;
	retryable: boolean | null;
	upstream_error_code: string | null;
	upstream_error_message: string | null;
	upstream_error_description: string | null;
	upstream_error_param: string | null;
}

export interface AsyncJobFailureDiagnostics {
	job_upstream_error: AsyncJobUpstreamErrorRow | null;
	job_provider_failure_diagnostics: AsyncJobProviderFailureDiagnosticsRow | null;
	job_failure_sample: AsyncJobFailureSampleRow[];
	job_routing_diagnostics: Record<string, unknown> | null;
	job_provider_enablement: Record<string, unknown> | null;
	job_provider_candidate_diagnostics: Record<string, unknown> | null;
}

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function normalizeBoolean(value: unknown): boolean | null {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (["1", "true", "yes", "on"].includes(normalized)) return true;
		if (["0", "false", "no", "off"].includes(normalized)) return false;
	}
	if (typeof value === "number") {
		if (value === 1) return true;
		if (value === 0) return false;
	}
	return null;
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function parseAsyncJobUpstreamError(value: unknown): AsyncJobUpstreamErrorRow | null {
	const record = normalizeRecord(value);
	if (!record) return null;
	const normalized: AsyncJobUpstreamErrorRow = {
		code: normalizeText(record.code),
		type: normalizeText(record.type),
		message: normalizeText(record.message),
		description: normalizeText(record.description),
		param: normalizeText(record.param),
		status: normalizeFiniteNumber(record.status),
	};
	return Object.values(normalized).every((entry) => entry == null) ? null : normalized;
}

function parseAsyncJobProviderFailureDiagnostics(
	value: unknown,
): AsyncJobProviderFailureDiagnosticsRow | null {
	const record = normalizeRecord(value);
	if (!record) return null;
	const normalized: AsyncJobProviderFailureDiagnosticsRow = {
		category: normalizeText(record.category),
		provider: normalizeText(record.provider),
		hint: normalizeText(record.hint),
	};
	return Object.values(normalized).every((entry) => entry == null) ? null : normalized;
}

function parseAsyncJobFailureSample(value: unknown): AsyncJobFailureSampleRow[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => {
			const record = normalizeRecord(entry);
			if (!record) return null;
			const normalized: AsyncJobFailureSampleRow = {
				provider: normalizeText(record.provider),
				type: normalizeText(record.type),
				status: normalizeFiniteNumber(record.status),
				retryable: normalizeBoolean(record.retryable),
				upstream_error_code: normalizeText(record.upstream_error_code),
				upstream_error_message: normalizeText(record.upstream_error_message),
				upstream_error_description: normalizeText(record.upstream_error_description),
				upstream_error_param: normalizeText(record.upstream_error_param),
			};
			return Object.values(normalized).every((field) => field == null) ? null : normalized;
		})
		.filter((entry): entry is AsyncJobFailureSampleRow => Boolean(entry));
}

export function parseAsyncJobFailureDiagnostics(
	meta: AsyncJobFailureDiagnosticsRoot,
): AsyncJobFailureDiagnostics {
	const errorMeta = normalizeRecord(meta?.error);
	const directFailureSample = parseAsyncJobFailureSample(
		meta?.failureSample ?? meta?.failure_sample,
	);
	return {
		job_upstream_error:
			parseAsyncJobUpstreamError(meta?.upstreamError ?? meta?.upstream_error) ??
			parseAsyncJobUpstreamError(errorMeta?.upstream_error) ??
			parseAsyncJobUpstreamError(errorMeta),
		job_provider_failure_diagnostics:
			parseAsyncJobProviderFailureDiagnostics(
				meta?.providerFailureDiagnostics ?? meta?.provider_failure_diagnostics,
			) ??
			parseAsyncJobProviderFailureDiagnostics(errorMeta?.provider_failure_diagnostics),
		job_failure_sample:
			directFailureSample.length > 0
				? directFailureSample
				: parseAsyncJobFailureSample(errorMeta?.failure_sample),
		job_routing_diagnostics:
			normalizeRecord(meta?.routingDiagnostics ?? meta?.routing_diagnostics) ??
			normalizeRecord(errorMeta?.routing_diagnostics),
		job_provider_enablement:
			normalizeRecord(meta?.providerEnablement ?? meta?.provider_enablement) ??
			normalizeRecord(errorMeta?.provider_enablement),
		job_provider_candidate_diagnostics:
			normalizeRecord(
				meta?.providerCandidateDiagnostics ?? meta?.provider_candidate_diagnostics,
			) ?? normalizeRecord(errorMeta?.provider_candidate_diagnostics),
	};
}
