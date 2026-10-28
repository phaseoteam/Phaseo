import { isAnalyticsCaptureAllowed } from "@/lib/clientErrorReporting";

export const PRODUCT_ANALYTICS_EVENT = "phaseo:product-analytics";

export type ProductAnalyticsEventMap = {
	account_signup_started: { method: "email" | "github" | "gitlab" | "google" };
	api_key_created: {
		preset: "ci" | "development" | "production" | "sandbox";
		surface: "onboarding" | "settings";
	};
	credits_checkout_started: {
		amount_usd: number;
		country_code: string;
		currency: "usd";
		mode: "oneoff" | "pay_and_save";
		payment_method: "new" | "saved";
	};
	credits_purchase_location_reviewed: {
		country_code: string;
		restricted_model_count: number;
		region_restricted_model_count: number;
	};
	credits_purchase_location_acknowledged: {
		country_code: string;
		restricted_model_count: number;
		region_restricted_model_count: number;
	};
	credits_payment_succeeded: {
		amount_usd: number;
		currency: "usd";
		mode: "oneoff" | "pay_and_save";
		payment_method: "saved";
	};
	credits_purchase_blocker_feedback_submitted: {
		has_details: boolean;
		reason_key: string;
		surface: "settings_credits_zero_balance";
	};
	credits_purchase_blocker_survey_viewed: {
		surface: "settings_credits_zero_balance";
	};
	// Triggers the "first request" PostHog survey; sent once per workspace per browser.
	gateway_first_usage_seen: { surface: "usage_overview" };
	first_payment_save_card_click: {
		amount_usd: number;
		currency: "usd";
		fee_usd: number;
		surface: "credits_top_up_dialog";
		total_usd: number;
	};
	onboarding_finished: {
		completed_step_count: number;
		outcome: "completed" | "skipped";
	};
	quickstart_opened: {
		model_id: string;
		surface: "model_page";
	};
	quickstart_api_key_clicked: { model_id: string };
	quickstart_code_copied: {
		code_kind: "api_key_environment" | "request";
		endpoint: string;
		language: string;
		model_id: string;
	};
	quickstart_endpoint_selected: { endpoint: string; model_id: string };
	quickstart_model_id_copied: {
		model_id: string;
		selected_model_id: string;
	};
};

export type ProductAnalyticsPayload = {
	[K in keyof ProductAnalyticsEventMap]: {
		event: K;
		properties: ProductAnalyticsEventMap[K];
	};
}[keyof ProductAnalyticsEventMap];

export function captureProductEvent<K extends keyof ProductAnalyticsEventMap>(
	event: K,
	properties: ProductAnalyticsEventMap[K],
) {
	if (typeof window === "undefined") return;

	window.dispatchEvent(
		new CustomEvent<ProductAnalyticsPayload>(PRODUCT_ANALYTICS_EVENT, {
			detail: { event, properties } as ProductAnalyticsPayload,
		}),
	);
}

/** Captures a milestone event at most once per `onceKey` in this browser. */
export function captureProductEventOnce<K extends keyof ProductAnalyticsEventMap>(
	event: K,
	properties: ProductAnalyticsEventMap[K],
	onceKey: string,
) {
	// Without consent the event is dropped, so don't spend the once-only marker.
	if (typeof window === "undefined" || !isAnalyticsCaptureAllowed()) return;

	const storageKey = `phaseo:product-event-once:${event}:${onceKey}`;
	try {
		if (window.localStorage.getItem(storageKey)) return;
		window.localStorage.setItem(storageKey, new Date().toISOString());
	} catch {
		// Without storage the event may repeat; PostHog surveys still show once per person.
	}
	captureProductEvent(event, properties);
}
