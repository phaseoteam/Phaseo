export type ScopeAction = "identity" | "gateway" | "read" | "manage" | "delete" | "unknown";
export type ScopeTone = "identity" | "read" | "write" | "delete";

const SCOPE_RESOURCES = {
	profile: "profile",
	email: "emailAddress",
	me: "currentAccount",
	gateway: "gatewayCredits",
	models: "models",
	providers: "providers",
	pricing: "pricing",
	credits: "credits",
	activity: "activity",
	analytics: "analytics",
	generations: "generations",
	feedback: "feedback",
	workspaces: "workspaces",
	keys: "apiKeys",
	presets: "presets",
	settings: "settings",
	provider_credentials: "providerCredentials",
	guardrails: "guardrails",
	budgets: "budgets",
	management_keys: "managementKeys",
	oauth_clients: "oauthApps",
} as const;

type ScopeResourceKey = (typeof SCOPE_RESOURCES)[keyof typeof SCOPE_RESOURCES];

export type ScopePermission = {
	scope: string;
	action: ScopeAction;
	resourceKey?: ScopeResourceKey;
	tone: ScopeTone;
};

export function scopePermissionFor(scope: string): ScopePermission {
	if (scope === "openid") {
		return { scope, action: "identity", tone: "identity" };
	}
	if (scope === "profile") {
		return { scope, action: "read", resourceKey: "profile", tone: "read" };
	}
	if (scope === "email") {
		return { scope, action: "read", resourceKey: "emailAddress", tone: "read" };
	}
	if (scope === "gateway:access") {
		return { scope, action: "gateway", resourceKey: "gatewayCredits", tone: "write" };
	}

	const [rawResource, rawAction] = scope.split(":");
	const resourceKey = SCOPE_RESOURCES[rawResource as keyof typeof SCOPE_RESOURCES];
	if (!resourceKey) {
		const tone = rawAction === "delete" ? "delete" : rawAction === "write" ? "write" : "read";
		return { scope, action: "unknown", tone };
	}

	const action: ScopeAction =
		rawAction === "read"
			? "read"
			: rawAction === "write"
				? "manage"
				: rawAction === "delete"
					? "delete"
					: "unknown";
	const tone: ScopeTone = action === "delete" ? "delete" : action === "manage" ? "write" : "read";
	return { scope, action, resourceKey, tone };
}
