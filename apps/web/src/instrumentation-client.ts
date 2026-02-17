import posthog from "posthog-js";
import { POSTHOG_API_HOST, POSTHOG_KEY, POSTHOG_UI_HOST } from "@/lib/analytics";
import {
	ANALYTICS_CONSENT_EVENT,
	ANALYTICS_CONSENT_STORAGE_KEY,
	type AnalyticsConsent,
	parseAnalyticsConsent,
	readAnalyticsConsent,
} from "@/lib/cookieConsent";
import {
	CLIENT_ERROR_EVENT,
	type ClientErrorPayload,
	isAnalyticsCaptureAllowed,
} from "@/lib/clientErrorReporting";

let posthogInitialized = false;
let listenersBound = false;
let posthogEnabled = false;

const RECENT_ERROR_WINDOW_MS = 15000;
const RECENT_ERROR_MAX = 100;
const recentErrorFingerprints = new Map<string, number>();

declare global {
	interface Window {
		gtag?: (...args: unknown[]) => void;
	}
}

function normalizeErrorPayload(
	partial: Omit<ClientErrorPayload, "message"> & { message?: string }
): ClientErrorPayload {
	return {
		...partial,
		message:
			partial.message?.trim() ||
			(partial.source === "window.unhandledrejection"
				? "Unhandled promise rejection"
				: "Unhandled client error"),
	};
}

function getErrorFingerprint(payload: ClientErrorPayload): string {
	const message = payload.message.slice(0, 240);
	const stack = payload.stack?.slice(0, 240) ?? "";
	return [payload.source, message, stack].join("|");
}

function shouldSkipAsDuplicate(payload: ClientErrorPayload): boolean {
	const now = Date.now();

	for (const [key, seenAt] of recentErrorFingerprints) {
		if (now - seenAt > RECENT_ERROR_WINDOW_MS) {
			recentErrorFingerprints.delete(key);
		}
	}

	const fingerprint = getErrorFingerprint(payload);
	const seenAt = recentErrorFingerprints.get(fingerprint);
	if (seenAt && now - seenAt <= RECENT_ERROR_WINDOW_MS) {
		return true;
	}

	recentErrorFingerprints.set(fingerprint, now);
	if (recentErrorFingerprints.size > RECENT_ERROR_MAX) {
		const firstKey = recentErrorFingerprints.keys().next().value as
			| string
			| undefined;
		if (firstKey) {
			recentErrorFingerprints.delete(firstKey);
		}
	}

	return false;
}

function captureToGa(payload: ClientErrorPayload) {
	if (typeof window === "undefined" || typeof window.gtag !== "function") {
		return;
	}

	window.gtag("event", "exception", {
		description: `${payload.source}: ${payload.message}`.slice(0, 1000),
		fatal: Boolean(payload.fatal),
	});
}

function captureToPosthog(payload: ClientErrorPayload) {
	if (!posthogInitialized) {
		return;
	}

	const contextJson = payload.context
		? JSON.stringify(payload.context).slice(0, 4000)
		: undefined;

	posthog.capture("web_client_error", {
		source: payload.source,
		message: payload.message,
		stack: payload.stack?.slice(0, 8000),
		fatal: Boolean(payload.fatal),
		handled: Boolean(payload.handled),
		url:
			typeof window !== "undefined" ? window.location.href : undefined,
		path:
			typeof window !== "undefined"
				? `${window.location.pathname}${window.location.search}`
				: undefined,
		user_agent:
			typeof navigator !== "undefined" ? navigator.userAgent : undefined,
		context: contextJson,
	});
}

function captureClientError(payloadInput: ClientErrorPayload) {
	const payload = normalizeErrorPayload(payloadInput);

	if (!isAnalyticsCaptureAllowed()) {
		return;
	}

	if (shouldSkipAsDuplicate(payload)) {
		return;
	}

	captureToGa(payload);
	captureToPosthog(payload);
}

function bindGlobalErrorListeners() {
	if (typeof window === "undefined" || listenersBound) {
		return;
	}

	listenersBound = true;

	window.addEventListener("error", (event) => {
		const error = event.error;
		let stack: string | null = null;
		if (error instanceof Error) {
			stack = error.stack ?? null;
		} else if (
			typeof error === "object" &&
			error &&
			"stack" in error &&
			typeof (error as { stack?: unknown }).stack === "string"
		) {
			stack = (error as { stack?: string }).stack ?? null;
		}

		captureClientError({
			source: "window.error",
			message:
				error instanceof Error
					? error.message
					: event.message || "Unhandled window error",
			stack,
			fatal: true,
			handled: false,
			context: {
				filename: event.filename || null,
				lineno: event.lineno || null,
				colno: event.colno || null,
			},
		});
	});

	window.addEventListener("unhandledrejection", (event) => {
		const reason = event.reason;
		const message =
			reason instanceof Error
				? reason.message
				: typeof reason === "string"
					? reason
					: "Unhandled promise rejection";
		const stack = reason instanceof Error ? reason.stack : null;

		captureClientError({
			source: "window.unhandledrejection",
			message,
			stack,
			fatal: false,
			handled: false,
		});
	});

	window.addEventListener(CLIENT_ERROR_EVENT, (event) => {
		const customEvent = event as CustomEvent<ClientErrorPayload>;
		if (!customEvent.detail) return;
		captureClientError(customEvent.detail);
	});
}

function enablePosthog() {
	if (typeof window === "undefined" || !POSTHOG_KEY) {
		return;
	}

	initializePosthog();

	if (posthogEnabled) {
		return;
	}

	posthogEnabled = true;
	posthog.set_config({
		autocapture: true,
		capture_pageview: true,
	});
	posthog.opt_in_capturing({ captureEventName: false });
	posthog.capture("$pageview");
}

function disablePosthog() {
	if (!posthogInitialized) {
		return;
	}

	if (!posthogEnabled) {
		posthog.opt_out_capturing();
		return;
	}

	posthogEnabled = false;
	posthog.set_config({
		autocapture: false,
		capture_pageview: false,
	});
	posthog.opt_out_capturing();
	posthog.reset();
}

function applyPosthogConsent(consent: AnalyticsConsent | null) {
	if (consent === "accepted") {
		enablePosthog();
		return;
	}

	disablePosthog();
}

function initializePosthog() {
	if (typeof window === "undefined" || !POSTHOG_KEY || posthogInitialized) {
		return;
	}

	posthog.init(POSTHOG_KEY, {
		api_host: POSTHOG_API_HOST,
		ui_host: POSTHOG_UI_HOST,
		defaults: "2025-05-24",
		autocapture: false,
		capture_pageview: false,
		debug: process.env.NODE_ENV === "development",
	});
	posthogInitialized = true;
}

if (typeof window !== "undefined" && POSTHOG_KEY) {
	bindGlobalErrorListeners();
	initializePosthog();
	applyPosthogConsent(readAnalyticsConsent());

	window.addEventListener(ANALYTICS_CONSENT_EVENT, (event) => {
		const customEvent = event as CustomEvent<AnalyticsConsent>;
		applyPosthogConsent(customEvent.detail ?? null);
	});

	window.addEventListener("storage", (event) => {
		if (event.key !== ANALYTICS_CONSENT_STORAGE_KEY) return;
		applyPosthogConsent(parseAnalyticsConsent(event.newValue));
	});
}

if (typeof window !== "undefined" && !POSTHOG_KEY) {
	bindGlobalErrorListeners();
}
