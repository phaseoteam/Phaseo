import { readAnalyticsConsent } from "@/lib/cookieConsent";

export const CLIENT_ERROR_EVENT = "ai-stats:client-error";

export type ClientErrorPayload = {
	source:
		| "window.error"
		| "window.unhandledrejection"
		| "global-error-boundary"
		| "manual";
	message: string;
	stack?: string | null;
	fatal?: boolean;
	handled?: boolean;
	context?: Record<string, unknown>;
};

export function isAnalyticsCaptureAllowed(): boolean {
	return readAnalyticsConsent() === "accepted";
}

export function reportClientError(payload: ClientErrorPayload) {
	if (typeof window === "undefined") {
		return;
	}

	window.dispatchEvent(
		new CustomEvent<ClientErrorPayload>(CLIENT_ERROR_EVENT, {
			detail: payload,
		})
	);
}

