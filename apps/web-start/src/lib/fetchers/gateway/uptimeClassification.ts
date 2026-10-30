type GatewayRequestForUptime = {
	success: boolean | number | string | null;
	error_code?: string | null;
	status_code?: number | null;
};

export type UptimeOutcome = "count_success" | "count_failure" | "exclude";

const USER_CODE_HINTS = [
	"invalid_json",
	"validation",
	"unsupported_param",
	"unsupported_model_or_endpoint",
	"unsupported_modalities",
	"bad_request",
	"missing_required",
];

const GATEWAY_CODE_HINTS = [
	"gateway",
	"routing",
	"breaker",
	"provider_status_not_ready",
	"no_key",
	"missing_api_key",
	"provider_key",
	"pricing_not_configured",
	"no_provider_pricing",
	"all_candidates_failed",
	"executor",
	"internal",
];

function hasHint(value: string, hints: string[]): boolean {
	return hints.some((hint) => value.includes(hint));
}

function parseErrorCode(errorCode: string | null | undefined): {
	scope: string | null;
	raw: string;
} {
	const normalized = String(errorCode ?? "")
		.trim()
		.toLowerCase();
	if (!normalized) return { scope: null, raw: "" };

	const firstColon = normalized.indexOf(":");
	if (firstColon === -1) return { scope: null, raw: normalized };

	const scope = normalized.slice(0, firstColon);
	const raw = normalized.slice(firstColon + 1);
	if (!raw) return { scope: null, raw: normalized };

	return { scope, raw };
}

function isSuccessFlag(value: GatewayRequestForUptime["success"]): boolean {
	return (
		value === true ||
		value === 1 ||
		value === "1" ||
		value === "true" ||
		value === "t"
	);
}

export function classifyGatewayRequestForUptime(
	row: GatewayRequestForUptime
): UptimeOutcome {
	if (isSuccessFlag(row.success)) return "count_success";

	const statusCode = Number(row.status_code ?? NaN);
	if (Number.isFinite(statusCode) && statusCode > 0 && statusCode < 400) {
		return "count_success";
	}

	const { scope, raw } = parseErrorCode(row.error_code);
	const code = raw;

	if (scope === "user" || hasHint(code, USER_CODE_HINTS)) {
		return "exclude";
	}

	if (
		scope === "gateway" ||
		(scope === "system" && hasHint(code, GATEWAY_CODE_HINTS)) ||
		hasHint(code, GATEWAY_CODE_HINTS)
	) {
		return "exclude";
	}

	if (Number.isFinite(statusCode)) {
		if (statusCode >= 500 || statusCode === 429 || statusCode === 408) {
			return "count_failure";
		}
		if (statusCode >= 400 && statusCode < 500) {
			return "exclude";
		}
	}

	return "count_failure";
}
