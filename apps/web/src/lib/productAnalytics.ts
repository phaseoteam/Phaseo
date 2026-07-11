export const PRODUCT_ANALYTICS_EVENT = "phaseo:product-analytics";

export type ProductAnalyticsEventMap = {
	account_signup_started: { method: "email" | "github" | "gitlab" | "google" };
	api_key_created: {
		preset: "ci" | "development" | "production" | "sandbox";
		surface: "onboarding" | "settings";
	};
	credits_checkout_started: {
		amount_usd: number;
		currency: "usd";
		mode: "oneoff" | "pay_and_save";
		payment_method: "new" | "saved";
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
