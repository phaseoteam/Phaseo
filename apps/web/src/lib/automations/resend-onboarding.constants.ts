export const RESEND_ONBOARDING_EVENT_NAMES = {
	USER_CREATED: "user.created",
	CHECKOUT_STARTED: "checkout.started",
	CREDITS_PURCHASED: "credits.purchased",
	WORKSPACE_LOW_BALANCE: "workspace.low_balance",
} as const;

export const RESEND_ONBOARDING_TEMPLATE_ALIASES = {
	WELCOME_INITIAL: "onboarding-welcome-initial",
	WELCOME_PURCHASED_7D: "onboarding-welcome-purchased-7d",
	WELCOME_NOT_PURCHASED_7D: "onboarding-welcome-not-purchased-7d",
	CHECKOUT_ABANDONED: "onboarding-checkout-abandoned",
	LOW_BALANCE: "billing-low-balance-alert",
} as const;

export const RESEND_ONBOARDING_AUTOMATION_NAMES = {
	WELCOME_7_DAY_BRANCH: "Onboarding: Welcome + 3 day purchase branch",
	CHECKOUT_ABANDONMENT: "Onboarding: Checkout started but no purchase",
	PURCHASED_CONTACT_STATE: "Onboarding: Contact state from credits purchased",
	LOW_BALANCE_ALERT: "Billing: Low balance alert",
} as const;

export const RESEND_ONBOARDING_AUTOMATION_LEGACY_NAMES = {
	WELCOME_7_DAY_BRANCH: ["Onboarding: Welcome + 7 day purchase branch"],
} as const;
