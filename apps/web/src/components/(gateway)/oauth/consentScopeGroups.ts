export type ConsentScopeGroupKey =
	| "identity"
	| "gateway"
	| "catalog"
	| "data"
	| "workspaces"
	| "keys"
	| "presets"
	| "settings"
	| "guardrails"
	| "management-keys"
	| "oauth-apps"
	| `other:${string}`;

export type ConsentScopeGroup = {
	key: ConsentScopeGroupKey;
	scopes: string[];
};

function groupKeyForScope(scope: string): ConsentScopeGroupKey {
	if (["openid", "profile", "email", "me:read"].includes(scope)) return "identity";
	if (scope.startsWith("gateway:")) return "gateway";
	if (/^(models|providers|pricing):/.test(scope)) return "catalog";
	if (/^(credits|activity|analytics|generations|feedback):/.test(scope)) return "data";
	if (scope.startsWith("workspaces:")) return "workspaces";
	if (scope.startsWith("keys:")) return "keys";
	if (scope.startsWith("presets:")) return "presets";
	if (scope.startsWith("settings:")) return "settings";
	if (scope.startsWith("guardrails:")) return "guardrails";
	if (scope.startsWith("management_keys:")) return "management-keys";
	if (scope.startsWith("oauth_clients:")) return "oauth-apps";
	return `other:${scope.split(":")[0] || "other"}`;
}

export function groupConsentScopes(requestedScopes: string[]): ConsentScopeGroup[] {
	const groups = new Map<ConsentScopeGroupKey, ConsentScopeGroup>();
	const uniqueScopes = Array.from(
		new Set(requestedScopes.map((scope) => scope.trim()).filter(Boolean)),
	);

	for (const scope of uniqueScopes) {
		const key = groupKeyForScope(scope);
		const existing = groups.get(key);
		if (existing) {
			existing.scopes.push(scope);
			continue;
		}

		groups.set(key, { key, scopes: [scope] });
	}

	return Array.from(groups.values());
}
