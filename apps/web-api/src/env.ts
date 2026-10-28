import type { SlackAgentAdminBinding } from "@/lib/slack-agent-admin";

export type Env = {
  ENV: "development" | "preview" | "staging" | "production";
	SUPABASE_URL?: string;
	SUPABASE_ANON_KEY?: string;
	NEXT_PUBLIC_SUPABASE_URL?: string;
	NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
	SUPABASE_SERVICE_ROLE_KEY?: string;
	REVALIDATION_SECRET?: string;
	INVITE_ENCRYPTION_KEY?: string;
	HMAC_ENCRYPTION_KEY?: string;
	SCIM_TOKEN_PEPPER?: string;
	LINEAR_API_KEY?: string;
	LINEAR_DEFAULT_ASSIGNED_USER_ID?: string;
	LINEAR_DEFAULT_TIER_ID?: string;
	KEY_PEPPER_ACTIVE?: string;
	KEY_PEPPER_PREVIOUS?: string;
	PHASEO_OAUTH_TOKEN_PEPPER?: string;
	PHASEO_THIRD_PARTY_OAUTH_ENABLED?: string;
	BYOK_ACTIVE_KEY_VERSION?: string;
	BYOK_KMS_KEY_V1?: string;
	BYOK_FINGERPRINT_PEPPER?: string;
	ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY?: string;
	ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_VERSION?: string;
	ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_PREVIOUS?: string;
	ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_PREVIOUS_VERSION?: string;
	WEBHOOK_SECRET_ENCRYPTION_KEY?: string;
	CHAT_ROUTE_KEY_SEED?: string;
	CHAT_ROUTE_FORCE_HASH_SYNC?: string;
	NON_ENTERPRISE_KEY_LIMIT?: string;
	PHASEO_MANAGEMENT_KEY?: string;
	PHASEO_CONTROL_KEY?: string;
	PHASEO_CONTROL_SECRET?: string;
	GATEWAY_API_ORIGIN?: string;
	GATEWAY_INTERNAL_TEST_TOKEN?: string;
	/** Display only: "true" when the gateway enforces spend rule blocks (mirrors its SPEND_RULE_BLOCKS_ENABLED). */
	SPEND_RULE_BLOCKS_ENABLED?: string;
	RESEND_API_KEY?: string;
	EXPO_ACCESS_TOKEN?: string;
	FEEDBACK_REWARD_USD?: string;
	FEEDBACK_REWARD_CAP?: string;
	/** PostHog project API key (the public phc_ key the browser also uses). Feedback answers are sent with it. */
	POSTHOG_PROJECT_API_KEY?: string;
	/** PostHog ingestion host. Defaults to https://eu.i.posthog.com. */
	POSTHOG_HOST?: string;
	DISCORD_BILLING_WEBHOOK_URL?: string;
	DISCORD_WEBHOOK_NEW_MODELS_PUBLIC?: string;
	DISCORD_ROLE_ID?: string;
	GITHUB_REPOSITORY?: string;
	GITHUB_TOKEN?: string;
	GH_TOKEN?: string;
	ENABLE_GATEWAY_USAGE_RAW_FALLBACK?: string;
	USAGE_MODEL_METADATA_DEBUG?: string;
	NEXT_PUBLIC_USAGE_MODEL_METADATA_DEBUG?: string;
	AI_STATS_GATEWAY_URL?: string;
	PHASEO_GATEWAY_URL?: string;
	STAGING_GATEWAY_BASE_URL?: string;
	NEXT_PUBLIC_GATEWAY_API_URL?: string;
	NEXT_PUBLIC_API_URL?: string;
	COMPATIBILITY_OPENAI_SPEC_URL?: string;
	COMPATIBILITY_ANTHROPIC_SPEC_URL?: string;
	PHASEO_PERFORMANCE_TEST_KEY?: string;
	PERFORMANCE_KEY_OPENROUTER?: string;
	OPENROUTER_API_KEY?: string;
	OPENAI_API_KEY?: string;
	CONTENT_PROVENANCE_RATE_LIMITER?: RateLimit;
	PROVIDER_ONBOARDING_RATE_LIMITER?: RateLimit;
	SCIM_RATE_LIMITER?: RateLimit;
	PERFORMANCE_KEY_LLMGATEWAY?: string;
	LLM_GATEWAY_API_KEY?: string;
	LLMGATEWAY_API_KEY?: string;
	PERFORMANCE_KEY_VERCEL_AI_GATEWAY?: string;
	AI_GATEWAY_API_KEY?: string;
	VERCEL_AI_GATEWAY_API_KEY?: string;
	VIDEO_CHAT_API_ENABLED?: string;
	NEXT_PUBLIC_VIDEO_CHAT_API_ENABLED?: string;
	STATSIG_SERVER_KEY?: string;
	DISCORD_SIGNUP_WEBHOOK_URL?: string;
	/** The hosted Phaseo Slack app's OAuth credentials. Without them, installing the hosted app returns 503 slack_not_configured. */
	SLACK_CLIENT_ID?: string;
	SLACK_CLIENT_SECRET?: string;
	/** Signs the Slack OAuth state and account-link tokens (shared with the Slack Worker). */
	SLACK_STATE_SECRET?: string;
	/** Encrypts Slack bot tokens, gateway keys and custom app secrets (shared with the Slack Worker). */
	SLACK_SECRETS_ENCRYPTION_KEY?: string;
	SLACK_SECRETS_ENCRYPTION_KEY_VERSION?: string;
	/** Public web origin for the Slack OAuth redirect and the settings page. Defaults to https://phaseo.app. */
	PHASEO_WEB_ORIGIN?: string;
	/** The Slack agent Worker's admin entrypoint (service binding, production only): its shared pages. */
	SLACK_AGENT?: SlackAgentAdminBinding;
	PROVIDER_MODEL_REVIEW_SLACK_WEBHOOK?: string;
	PROVIDER_MODEL_REVIEW_SLACK_USER_ID?: string;
	STATUS_PAGE_URL?: string;
	STATUS_PAGE_WIDGET_API_URL?: string;
	PROFILE_AVATARS_BUCKET?: R2Bucket;
	GATEWAY_ROUTING_ARCHIVES_BUCKET?: R2Bucket;
	PROFILE_AVATARS_PUBLIC_BASE_URL?: string;
};
