export type ChatRequestErrorKind =
	| "payment"
	| "authentication"
	| "validation"
	| "forbidden"
	| "model-unavailable"
	| "timeout"
	| "conflict"
	| "rate-limit"
	| "service"
	| "generic";

type PresentableChatError = {
	status: number | null;
	errorCode: string | null;
	message: string;
	description: string | null;
	details: Array<{ message: string }>;
};

export type ChatRequestErrorTitleKey =
	| "titles.modelUnavailableInChat"
	| "titles.addCredits"
	| "titles.signInAgain"
	| "titles.requestNeedsChange"
	| "titles.requestNotAllowed"
	| "titles.modelUnavailable"
	| "titles.requestTimedOut"
	| "titles.requestConflict"
	| "titles.modelBusy"
	| "titles.temporarilyUnavailable"
	| "titles.requestFailed";

export type ChatRequestErrorDescriptionKey =
	| "descriptions.chooseAnotherModel"
	| "descriptions.orTryFreeModel"
	| "descriptions.sessionExpired"
	| "descriptions.requestTimedOut"
	| "descriptions.stateChanged"
	| "descriptions.modelBusy"
	| "descriptions.tryAgainOrChooseAnother";

export type ChatRequestErrorPresentation = {
	kind: ChatRequestErrorKind;
	titleKey: ChatRequestErrorTitleKey;
	descriptionKey: ChatRequestErrorDescriptionKey | null;
	canRetry: boolean;
	canChooseModel: boolean;
};

export function getChatRequestErrorPresentation(
	error: PresentableChatError,
): ChatRequestErrorPresentation {
	const code = String(error.errorCode ?? "").toLowerCase();
	const status = error.status;

	if (/(pricing_not_configured|missing_pricing)/.test(code)) {
		return {
			kind: "model-unavailable",
			titleKey: "titles.modelUnavailableInChat",
			descriptionKey: "descriptions.chooseAnotherModel",
			canRetry: false,
			canChooseModel: true,
		};
	}

	if (
		status === 402 ||
		/(insufficient_(funds|credits)|payment_required|credit_balance)/.test(code)
	) {
		return {
			kind: "payment",
			titleKey: "titles.addCredits",
			descriptionKey: "descriptions.orTryFreeModel",
			canRetry: false,
			canChooseModel: false,
		};
	}

	if (status === 401 || /(unauthorized|authentication|invalid_token)/.test(code)) {
		return {
			kind: "authentication",
			titleKey: "titles.signInAgain",
			descriptionKey: "descriptions.sessionExpired",
			canRetry: false,
			canChooseModel: false,
		};
	}

	if (status === 400 || status === 422 || /(validation|invalid_request)/.test(code)) {
		return {
			kind: "validation",
			titleKey: "titles.requestNeedsChange",
			descriptionKey: null,
			canRetry: false,
			canChooseModel: false,
		};
	}

	if (status === 403 || /(forbidden|permission_denied|access_denied)/.test(code)) {
		return {
			kind: "forbidden",
			titleKey: "titles.requestNotAllowed",
			descriptionKey: null,
			canRetry: false,
			canChooseModel: false,
		};
	}

	if (status === 404 || /(model_not_found|not_found|no_candidates)/.test(code)) {
		return {
			kind: "model-unavailable",
			titleKey: "titles.modelUnavailable",
			descriptionKey: "descriptions.chooseAnotherModel",
			canRetry: false,
			canChooseModel: true,
		};
	}

	if (status === 408 || status === 504 || /(timeout|timed_out)/.test(code)) {
		return {
			kind: "timeout",
			titleKey: "titles.requestTimedOut",
			descriptionKey: "descriptions.requestTimedOut",
			canRetry: true,
			canChooseModel: false,
		};
	}

	if (status === 409 || code.includes("conflict")) {
		return {
			kind: "conflict",
			titleKey: "titles.requestConflict",
			descriptionKey: "descriptions.stateChanged",
			canRetry: true,
			canChooseModel: false,
		};
	}

	if (status === 429 || /(rate_limit|resource_exhausted|quota_exceeded)/.test(code)) {
		return {
			kind: "rate-limit",
			titleKey: "titles.modelBusy",
			descriptionKey: "descriptions.modelBusy",
			canRetry: true,
			canChooseModel: true,
		};
	}

	if (
		(status != null && status >= 500) ||
		/(upstream_error|all_failed|service_unavailable|empty_response)/.test(code)
	) {
		return {
			kind: "service",
			titleKey: "titles.temporarilyUnavailable",
			descriptionKey: "descriptions.tryAgainOrChooseAnother",
			canRetry: true,
			canChooseModel: true,
		};
	}

	return {
		kind: "generic",
		titleKey: "titles.requestFailed",
		descriptionKey: null,
		canRetry: false,
		canChooseModel: false,
	};
}
