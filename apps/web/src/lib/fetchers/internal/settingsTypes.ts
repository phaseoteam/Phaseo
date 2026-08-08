import type { StatsigProfile } from "@/lib/statsig/shared";
import type { SensitiveInfoRulePayload } from "@/app/(dashboard)/settings/guardrails/actions";
import type { DeprecationWarning } from "@/lib/fetchers/usage/types";

export type SettingsLayoutInitialData = {
	isEnterpriseInvoiceMode: boolean;
	showBroadcast: boolean;
	signedIn: boolean;
	workspaceId: string | null;
	workspaceName: string | null;
};

export type SettingsBetaInitialData = {
	isAdmin: boolean;
	profile: StatsigProfile;
	signedIn: boolean;
};

export type PrivacyGlobalSettings = {
	privacy_enable_paid_may_train?: boolean | null;
	privacy_enable_free_may_train?: boolean | null;
	privacy_enable_free_may_publish_prompts?: boolean | null;
	privacy_enable_input_output_logging?: boolean | null;
	privacy_zdr_only?: boolean | null;
	provider_restriction_mode?: string | null;
	provider_restriction_provider_ids?: string[] | null;
	provider_restriction_enforce_allowed?: boolean | null;
};

export type SettingsPrivacyInitialData = {
	activeProviderModels: Array<{
		apiModelId: string;
		internalModelId: string | null;
		providerId: string;
	}>;
	initialGlobal: PrivacyGlobalSettings | null;
	providers: Array<{ id: string; name: string }>;
	teamName: string | null;
	workspaceId: string | null;
	dataContribution: DataContributionSettings;
};

export type DataContributionClassifier = {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	kind: "openrouter_task" | "custom";
	instructions: string;
	categories: Record<string, string[]>;
	model: string;
	service_tier: "standard" | "flex";
	sample_rate_bps: number;
	enabled: boolean;
	created_at: string;
	updated_at: string;
};

export type DataContributionSettings = {
	available: boolean;
	enabled: boolean;
	policyVersion: string;
	consentedAt: string | null;
	sampleRateBps: number;
	classifierSampleRateBps: number;
	discountBps: number;
	contributions30d: number;
	discountNanos30d: number;
	classifiers: DataContributionClassifier[];
	analytics: Array<{
		usage_date: string;
		classifier_id: string;
		primary_category: string;
		model_slug: string;
		provider_slug: string;
		request_count: number;
		input_tokens: number;
		output_tokens: number;
	}>;
};

export type SettingsAccountDangerInitialData = {
	signedIn: boolean;
};

export type SettingsAccountDetailsInitialData = {
	hasPassword: boolean;
	teams: Array<{ id: string; name: string }>;
	user: {
		id: string;
		displayName?: string | null;
		email?: string | null;
		defaultWorkspaceId?: string | null;
		declaredCountryCode?: string | null;
		countryStorageAvailable?: boolean;
		obfuscateInfo: boolean;
		createdAt: string;
	} | null;
};

export type SettingsAccountMfaInitialData = {
	hasPassword: boolean;
	mfaEnabled: boolean;
	mfaFactorId: string | null;
	signedIn: boolean;
};

export type SettingsBroadcastInitialData = {
	configuredDestinations: Array<{
		destinationConfig: Record<string, unknown> | null;
		destinationId: string;
		enabled: boolean;
		id: string;
		name: string;
		samplingRate: number;
		updatedAt: string | null;
	}>;
	teamName: string | null;
	workspaceId: string | null;
};

export type SettingsAppRow = {
	app_key: string;
	category: string | null;
	created_at: string | null;
	docs_url: string | null;
	id: string;
	image_url: string | null;
	is_active: boolean;
	is_public: boolean;
	last_seen: string | null;
	title: string;
	url: string | null;
};

export type SettingsAppsInitialData = { apps: SettingsAppRow[] };

export type SettingsAuthorizedAppsInitialData = {
	authorizedApps: Array<Record<string, unknown>>;
	signedIn: boolean;
	userId: string | null;
};

export type SettingsOAuthAppsInitialData = {
	initialTeamId: string | null;
	oauthApps: Array<Record<string, unknown>>;
	signedIn: boolean;
};

export type SettingsOAuthAppDetailInitialData = {
	authorizations: Array<Record<string, unknown>>;
	currentUserId: string | null;
	oauthApp: Record<string, unknown> | null;
	recentRequests: Array<{
		request_id: string;
		created_at: string;
		oauth_user_id: string | null;
		endpoint: string | null;
		model_id: string | null;
		provider: string | null;
		success: boolean;
		status_code: number | null;
		error_code: string | null;
		cost_nanos: number | null;
		latency_ms: number | null;
	}>;
	signedIn: boolean;
	usageStats: Array<Record<string, unknown>>;
	userDirectory: Array<{ email: string | null; full_name: string | null; user_id: string }>;
};

export type SettingsManagementApiKeysInitialData = {
	currentUserId: string | undefined;
	teamsWithKeys: Array<{ id: string; keys: Array<Record<string, unknown>>; name: string }>;
	workspace: { id: string; name: string } | null;
};

export type ByokKeyEntry = {
	alwaysUse: boolean;
	createdAt: string;
	enabled: boolean;
	id: string;
	name: string;
	prefix?: string;
	providerId: string;
	routingMode: "priority" | "fallback";
	sortOrder: number;
	suffix?: string;
};

export type SettingsByokInitialData = {
	fallbackEnabled: boolean;
	freeRemaining: number;
	keyEntries: ByokKeyEntry[];
	legacyHiddenTotal: number;
	monthlyRequestCount: number;
	nextMonthStartIso: string;
	paidTierRequests: number;
	workspaceId: string | null;
};

export type SettingsKeysInitialData = {
	currentUserId: string | undefined;
	initialWorkspaceId: string | null;
	teamsWithKeys: Array<{ id: string; name: string; keys: Array<Record<string, unknown>> }>;
	workspaces: Array<{ id: string; name: string }>;
};

export type SettingsCreditsOnboardingInitialData = {
	canAccessOnboarding: boolean;
	canManageBilling: boolean;
	currentBillingMode: "wallet" | "invoice";
	initialBillingDay: number;
	initialPaymentTermsDays: 14 | 30;
	invoiceProfileEnabled: boolean;
	signedIn: boolean;
	signerName: string;
	team: { name: string; tier: string } | null;
	workspaceId: string | null;
};

export type SettingsCreditsTransactionsInitialData = {
	billingMode: "wallet" | "invoice";
	invoices: Array<{
		id: string;
		period_start: string;
		period_end: string;
		amount_nanos: number;
		currency?: string | null;
		status: "draft" | "open" | "paid" | "void" | "uncollectible";
		stripe_invoice_id?: string | null;
		stripe_invoice_number?: string | null;
		due_at?: string | null;
		issued_at?: string | null;
		paid_at?: string | null;
		created_at?: string | null;
		updated_at?: string | null;
	}>;
	isEnterpriseInvoiceMode: boolean;
	stripeCustomerId: string | null;
	teamTier: string;
	transactions: Array<{
		id: string;
		amount_nanos?: number | null;
		description?: string | null;
		created_at?: string | null;
		status?: string | null;
		kind?: string | null;
		ref_type?: string | null;
		ref_id?: string | null;
		source_ref_type?: string | null;
		source_ref_id?: string | null;
		before_balance_nanos?: number | null;
		after_balance_nanos?: number | null;
	}>;
	workspaceId: string | null;
};

export type SettingsCreditsInitialData = {
	declaredCountryCode: string | null;
	initialBalance: number;
	latestPaymentSuccessAt: string | null;
	autoTopUpFailureEmailEnabled: boolean;
	lowBalanceEmailEnabled: boolean;
	lowBalanceEmailThresholdUsd: number | null;
	paymentMethodExpiringEmailEnabled: boolean;
	obfuscateInfo: boolean;
	stripeInfo: {
		customer: { email: string | null; id: string | null };
		defaultPaymentMethodId: string | null;
		hasPaymentMethod: boolean;
		paymentMethods: Array<{
			card: { brand: string | null; exp_month: number | null; exp_year: number | null; last4: string | null };
			id: string;
		}>;
	};
	wallet: {
		stripe_customer_id?: string | null;
		balance_bigint?: number | null;
		auto_top_up_enabled: boolean | null;
		low_balance_threshold: number | null;
		auto_top_up_amount: number | null;
		[key: string]: unknown;
	} | null;
};

export type SettingsPaymentMethodsInitialData = {
	customerId: string | null;
	initialData: {
		customer: { id: string; email: string | null };
		defaultPaymentMethodId: string | null;
		paymentMethods: Array<{
			brand: string | null; created: number | null; expMonth: number | null;
			expYear: number | null; funding: string | null; id: string; last4: string | null;
		}>;
	};
	obfuscateInfo: boolean;
};

export type SettingsObservabilityDestinationNewInitialData = {
	destinationFound: boolean;
	keys: Array<{ id: string; name: string | null; prefix: string | null }>;
	modelOptions: Array<{ value: string; label: string; logoId?: string | null; subtitle?: string | null }>;
	providerOptions: Array<{ value: string; label: string; logoId?: string | null; subtitle?: string | null }>;
	teamName: string | null;
	workspaceId: string | null;
};

export type SettingsRoutingInitialData = {
	responseHealingEnabled: boolean;
	responseHealingLocked: boolean;
	responseHealingMode: "safe" | "strict";
	routingMode: "balanced" | "price" | "latency" | "throughput";
	teamName: string | null;
	alphaChannelEnabled: boolean;
	betaChannelEnabled: boolean;
	workspaceId: string | null;
};

export type DynamicRouteMode = "balanced" | "price" | "latency" | "throughput";
export type DynamicRouteAction = {
	model?: string | null;
	modelFallbacks?: string[];
	routingMode?: DynamicRouteMode;
	providerOrder: string[];
	providerOnly: string[];
	providerIgnore: string[];
	allowFallbacks: boolean;
};
export type DynamicRouteNodeType = "start" | "condition" | "percentage" | "model" | "rate_limit" | "budget_limit" | "end";
export type DynamicRouteNode = {
	id: string;
	type: DynamicRouteNodeType;
	position?: { x: number; y: number } | null;
	data: Record<string, any>;
};
export type DynamicRouteEdge = { id: string; source: string; target: string; sourceHandle?: string | null };
export type DynamicRouteRule = {
	id: string;
	name: string;
	enabled: boolean;
	condition: {
		field: "always" | "endpoint" | "model" | "session_id" | "metadata";
		operator: "equals" | "not_equals" | "contains" | "starts_with" | "exists";
		value?: string | null;
		metadataKey?: string | null;
	};
	action: DynamicRouteAction;
};
export type DynamicRouteConfig = {
	schemaVersion?: 2;
	entryNodeId?: string | null;
	nodes?: DynamicRouteNode[];
	edges?: DynamicRouteEdge[];
	cacheAwareRouting: boolean;
	sessionAffinity: boolean;
	defaultAction: DynamicRouteAction;
	rules: DynamicRouteRule[];
};
export type DynamicRouteRow = {
	id: string;
	workspace_id: string;
	name: string;
	description: string | null;
	status: "active" | "paused";
	version: number;
	deployed_version?: number | null;
	config: DynamicRouteConfig;
	keyIds: string[];
	created_at: string;
	updated_at: string;
	versions?: Array<{ version: number; status: "draft" | "deployed" | "superseded"; created_at: string; created_by?: string | null }>;
};
export type SettingsDynamicRoutesInitialData = {
	workspaceId: string | null;
	routes: DynamicRouteRow[];
	keys: Array<{ id: string; name: string; prefix: string; status: string }>;
	providers: Array<{ id: string; name: string; status?: string | null; routingStatus?: string | null }>;
	suggestions: Array<{
		providerId: string;
		providerName: string;
		severity: "warning" | "critical";
		failureRate: number;
		avgLatencyMs: number;
		attempts: number;
		message: string;
	}>;
};

export type SettingsPresetsInitialData = {
	currentUserId: string | undefined;
	initialTeamId: string | null;
	teams: Array<{ id: string; name: string }>;
	teamsWithPresets: Array<{ id: string; name: string; presets: Array<Record<string, unknown>> }>;
};

export type SettingsGuardrailProviderModel = { providerId: string; apiModelId: string; internalModelId: string | null; internalModelName?: string | null; organisationId?: string | null; organisationName?: string | null };
export type SettingsGuardrailRow = { id: string; enabled?: boolean | null; name?: string | null; description?: string | null; privacy_enable_paid_may_train?: boolean | null; privacy_enable_free_may_train?: boolean | null; privacy_enable_free_may_publish_prompts?: boolean | null; privacy_enable_input_output_logging?: boolean | null; privacy_zdr_only?: boolean | null; provider_restriction_mode?: string | null; provider_restriction_provider_ids?: string[] | null; provider_restriction_enforce_allowed?: boolean | null; model_restriction_mode?: string | null; allowed_api_model_ids?: string[] | null; prompt_injection_enabled?: boolean | null; prompt_injection_action?: string | null; sensitive_info_enabled?: boolean | null; sensitive_info_default_action?: string | null; sensitive_info_rules?: SensitiveInfoRulePayload[] | null; daily_limit_requests?: number | null; weekly_limit_requests?: number | null; monthly_limit_requests?: number | null; daily_limit_cost_nanos?: number | null; weekly_limit_cost_nanos?: number | null; monthly_limit_cost_nanos?: number | null };
export type SettingsGuardrailsInitialData = { activeProviderModels: SettingsGuardrailProviderModel[]; guardrailKeyIdsByGuardrailId: Record<string, string[]>; guardrails: SettingsGuardrailRow[]; keys: Array<{ id: string; name: string; prefix: string; status: string }>; providers: Array<{ id: string; name: string }>; workspaceId: string | null };
export type SettingsGuardrailEditorData = { activeProviderModels: SettingsGuardrailProviderModel[]; guardrail: SettingsGuardrailRow | null; initialKeyIds: string[]; keys: Array<{ id: string; name: string; prefix: string; status: string }>; mode: "create" | "edit"; providers: Array<{ id: string; name: string }>; teamName: string | null; workspaceId: string | null };

export type SettingsUsageAlertsInitialData = { signedIn: boolean; warnings: DeprecationWarning[]; workspaceId: string | null };

export type WorkspacePrivacySettings = {
	isAuthenticated: boolean;
	privacyEnablePaidMayTrain: boolean;
	privacyEnableFreeMayTrain: boolean;
	privacyZdrOnly: boolean;
	providerRestrictionMode: "none" | "allowlist" | "blocklist";
	providerRestrictionProviderIds: string[];
};

export type TeamsSettingsData = {
	teams: Array<{ id: string; name: string }>;
	membersByTeam: Record<string, any[]>;
	invitesByTeam: Record<string, any[]>;
	requestsByTeam: Record<string, any[]>;
	initialTeamId: string | null;
	currentUserId: string | null;
	personalTeamId: string | null;
	manageableTeamIds: string[];
	walletBalances: Record<string, number>;
	teamSsoSettingsByTeam: Record<string, any>;
};

type UsageLogsPayload = { appNameEntries: Array<[string, string]>; availableKeys: Array<{ id: string; name: string | null; prefix: string | null }>; dedupedModels: string[]; dedupedProviders: string[]; initialRequestsPage: any; modelMetadataEntries: Array<[string, any]>; modelProviderEntries: Array<[string, string[]]>; providerMetadataEntries: Array<[string, any]>; providerNameEntries: Array<[string, string]> };
type UsageJobsPayload = { appMetadataEntries: Array<[string, any]>; jobProviders: string[]; modelMetadataEntries: Array<[string, any]>; providerNameEntries: Array<[string, string]>; recentJobs: any[] };
type UsageSessionsPayload = { appMetadataEntries: Array<[string, any]>; modelMetadataEntries: Array<[string, any]>; providerMetadataEntries: Array<[string, any]>; providerNameEntries: Array<[string, string]>; sessionAppIds: string[]; sessionModelIds: string[]; sessionProviderIds: string[]; sessions: any[] };
export type UsageUpstreamRequestRow = {
	id: string;
	created_at: string;
	gateway_request_id: string;
	request_id: string;
	sequence: number;
	round_number: number;
	attempt_number: number | null;
	attempt_count?: number | null;
	internal_attempt_number: number | null;
	stage: string;
	endpoint: string;
	model_id: string;
	provider: string | null;
	api_model_id: string | null;
	provider_model_slug: string | null;
	status_code: number | null;
	status_text: string | null;
	success: boolean;
	outcome: string;
	retryable: boolean | null;
	fallback_attempted: boolean;
	was_probe: boolean;
	key_source: "gateway" | "byok" | null;
	key_id: string | null;
	native_response_id: string | null;
	provider_finish_reason: string | null;
	finish_reason: string | null;
	duration_ms: number | null;
	latency_ms: number | null;
	generation_ms: number | null;
	total_ms: number | null;
	request_build_ms: number | null;
	upstream_headers_ms: number | null;
	retry_delay_ms: number | null;
	usage: unknown;
	cost_nanos: number | string | null;
	currency: string | null;
	error_code: string | null;
	error_type: string | null;
	error_message: string | null;
	error_description: string | null;
	error_param: string | null;
	request_payload: unknown;
	response_payload: unknown;
	metadata: unknown;
};
type UsageUpstreamPayload = { availableKeys: Array<{ id: string; name: string | null; prefix: string | null }>; modelMetadataEntries: Array<[string, any]>; providerMetadataEntries: Array<[string, any]>; providerNameEntries: Array<[string, string]>; upstreamRequests: UsageUpstreamRequestRow[] };
export type SettingsUsageLogsInitialData = { signedIn: boolean; workspaceId: string | null } & ({ view: "logs"; data: UsageLogsPayload | null } | { view: "upstream"; data: UsageUpstreamPayload | null } | { view: "jobs"; data: UsageJobsPayload | null } | { view: "sessions"; data: UsageSessionsPayload | null });
