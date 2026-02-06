import posthog from "posthog-js";
import { POSTHOG_API_HOST, POSTHOG_KEY } from "@/lib/analytics";
import {
	ANALYTICS_CONSENT_EVENT,
	ANALYTICS_CONSENT_STORAGE_KEY,
	type AnalyticsConsent,
	parseAnalyticsConsent,
	readAnalyticsConsent,
} from "@/lib/cookieConsent";

let posthogInitialized = false;

function enablePosthog() {
	if (typeof window === "undefined" || !POSTHOG_KEY) {
		return;
	}

	if (!posthogInitialized) {
		posthog.init(POSTHOG_KEY, {
			api_host: POSTHOG_API_HOST,
			defaults: "2025-05-24",
			autocapture: true,
			capture_pageview: true,
			debug: process.env.NODE_ENV === "development",
		});
		posthogInitialized = true;
	}

	posthog.opt_in_capturing();
}

function disablePosthog() {
	if (!posthogInitialized) {
		return;
	}

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

if (typeof window !== "undefined" && POSTHOG_KEY) {
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
