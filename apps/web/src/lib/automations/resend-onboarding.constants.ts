export const RESEND_ONBOARDING_EVENT_NAMES = {
	USER_CREATED: "user.created",
	CHECKOUT_STARTED: "checkout.started",
	CREDITS_PURCHASED: "credits.purchased",
} as const;

export type ResendOnboardingEventName =
	(typeof RESEND_ONBOARDING_EVENT_NAMES)[keyof typeof RESEND_ONBOARDING_EVENT_NAMES];

export const RESEND_ONBOARDING_TEMPLATE_ALIASES = {
	WELCOME: "onboarding-welcome-v1",
	PURCHASED_WITHIN_7_DAYS: "onboarding-purchased-within-7-days-v1",
	NO_PURCHASE_7_DAYS: "onboarding-no-purchase-7-days-v1",
	CHECKOUT_ABANDONED: "checkout-abandoned-follow-up-v1",
} as const;

export const RESEND_ONBOARDING_AUTOMATION_NAMES = {
	SEVEN_DAY_ONBOARDING: "Onboarding: welcome and 7-day credits conversion",
	CHECKOUT_ABANDONED: "Checkout: started but not purchased",
	PURCHASE_CONTACT_STATE: "Lifecycle: update contact state on credits purchase",
} as const;

