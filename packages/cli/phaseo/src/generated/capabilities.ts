// Generated from ../../../shared/capabilities/index.ts
export const IDENTITY_SCOPES = [
	"openid",
	"profile",
	"email",
] as const;

export const GATEWAY_ACCESS_SCOPE = "gateway:access" as const;

export const CAPABILITIES = {
	ME_READ: "me:read",
	MODELS_READ: "models:read",
	PROVIDERS_READ: "providers:read",
	PRICING_READ: "pricing:read",
	CREDITS_READ: "credits:read",
	ACTIVITY_READ: "activity:read",
	ANALYTICS_READ: "analytics:read",
	GENERATIONS_READ: "generations:read",
	FEEDBACK_READ: "feedback:read",
	FEEDBACK_WRITE: "feedback:write",
	WORKSPACES_READ: "workspaces:read",
	WORKSPACES_WRITE: "workspaces:write",
	WORKSPACES_DELETE: "workspaces:delete",
	KEYS_READ: "keys:read",
	KEYS_WRITE: "keys:write",
	KEYS_DELETE: "keys:delete",
	PRESETS_READ: "presets:read",
	PRESETS_WRITE: "presets:write",
	PRESETS_DELETE: "presets:delete",
	SETTINGS_READ: "settings:read",
	SETTINGS_WRITE: "settings:write",
	PROVIDER_CREDENTIALS_READ: "provider_credentials:read",
	PROVIDER_CREDENTIALS_WRITE: "provider_credentials:write",
	PROVIDER_CREDENTIALS_DELETE: "provider_credentials:delete",
	PRIVATE_MODELS_READ: "private_models:read",
	PRIVATE_MODELS_WRITE: "private_models:write",
	PRIVATE_MODELS_DELETE: "private_models:delete",
	GUARDRAILS_READ: "guardrails:read",
	GUARDRAILS_WRITE: "guardrails:write",
	GUARDRAILS_DELETE: "guardrails:delete",
	BUDGETS_READ: "budgets:read",
	BUDGETS_WRITE: "budgets:write",
	BUDGETS_DELETE: "budgets:delete",
	MANAGEMENT_KEYS_READ: "management_keys:read",
	MANAGEMENT_KEYS_WRITE: "management_keys:write",
	MANAGEMENT_KEYS_DELETE: "management_keys:delete",
	OAUTH_CLIENTS_READ: "oauth_clients:read",
	OAUTH_CLIENTS_WRITE: "oauth_clients:write",
	OAUTH_CLIENTS_DELETE: "oauth_clients:delete",
} as const;

export const CONTROL_CAPABILITIES = Object.freeze(Object.values(CAPABILITIES));

// Keep this list explicit. Adding a control-plane capability must not silently
// broaden CLI consent or exceed the first-party client's database allowlist.
const CLI_CONTROL_CAPABILITIES = Object.freeze([
	CAPABILITIES.ME_READ,
	CAPABILITIES.MODELS_READ,
	CAPABILITIES.PROVIDERS_READ,
	CAPABILITIES.PRICING_READ,
	CAPABILITIES.CREDITS_READ,
	CAPABILITIES.ACTIVITY_READ,
	CAPABILITIES.ANALYTICS_READ,
	CAPABILITIES.GENERATIONS_READ,
	CAPABILITIES.WORKSPACES_READ,
	CAPABILITIES.WORKSPACES_WRITE,
	CAPABILITIES.WORKSPACES_DELETE,
	CAPABILITIES.KEYS_READ,
	CAPABILITIES.KEYS_WRITE,
	CAPABILITIES.KEYS_DELETE,
	CAPABILITIES.PRESETS_READ,
	CAPABILITIES.PRESETS_WRITE,
	CAPABILITIES.PRESETS_DELETE,
	CAPABILITIES.SETTINGS_READ,
	CAPABILITIES.SETTINGS_WRITE,
	CAPABILITIES.PROVIDER_CREDENTIALS_READ,
	CAPABILITIES.PROVIDER_CREDENTIALS_WRITE,
	CAPABILITIES.PROVIDER_CREDENTIALS_DELETE,
	CAPABILITIES.PRIVATE_MODELS_READ,
	CAPABILITIES.PRIVATE_MODELS_WRITE,
	CAPABILITIES.PRIVATE_MODELS_DELETE,
	CAPABILITIES.GUARDRAILS_READ,
	CAPABILITIES.GUARDRAILS_WRITE,
	CAPABILITIES.GUARDRAILS_DELETE,
	CAPABILITIES.BUDGETS_READ,
	CAPABILITIES.BUDGETS_WRITE,
	CAPABILITIES.BUDGETS_DELETE,
	CAPABILITIES.MANAGEMENT_KEYS_READ,
	CAPABILITIES.MANAGEMENT_KEYS_WRITE,
	CAPABILITIES.MANAGEMENT_KEYS_DELETE,
	CAPABILITIES.OAUTH_CLIENTS_READ,
	CAPABILITIES.OAUTH_CLIENTS_WRITE,
	CAPABILITIES.OAUTH_CLIENTS_DELETE,
]);

export const DEFAULT_CLI_OAUTH_CAPABILITIES = Object.freeze([
	...IDENTITY_SCOPES,
	...CLI_CONTROL_CAPABILITIES,
]);

export const DEFAULT_MANAGEMENT_KEY_CAPABILITIES = Object.freeze([
	...CONTROL_CAPABILITIES,
]);

export const ALL_SUPPORTED_SCOPES = Object.freeze([
	...IDENTITY_SCOPES,
	GATEWAY_ACCESS_SCOPE,
	...CONTROL_CAPABILITIES,
]);

const CONTROL_CAPABILITY_SET = new Set<string>(CONTROL_CAPABILITIES);
const SUPPORTED_SCOPE_SET = new Set<string>(ALL_SUPPORTED_SCOPES);

export function isSupportedScope(scope: string): boolean {
	return SUPPORTED_SCOPE_SET.has(scope);
}

export function isControlCapability(scope: string): boolean {
	return CONTROL_CAPABILITY_SET.has(scope);
}

export function normalizeScopeList(
	input: unknown,
	options: {
		allowIdentityScopes?: boolean;
		defaultScopes?: readonly string[];
	} = {},
): { ok: true; value: string[] } | { ok: false; message: string } {
	const allowIdentityScopes = options.allowIdentityScopes !== false;
	const defaultScopes = Array.isArray(options.defaultScopes) ? options.defaultScopes : [];
	const rawValues =
		input === undefined || input === null
			? defaultScopes
			: typeof input === "string"
				? input.split(/[,\s]+/)
				: Array.isArray(input)
					? input
					: null;
	if (!rawValues) {
		return { ok: false, message: "scopes must be a string or string[]" };
	}

	const scopes: string[] = [];
	const seen = new Set<string>();
	for (const rawScope of rawValues) {
		const scope = String(rawScope ?? "").trim();
		if (!scope || seen.has(scope)) continue;
		if (!isSupportedScope(scope)) {
			return { ok: false, message: `Unsupported scope: ${scope}` };
		}
		if (!allowIdentityScopes && !isControlCapability(scope)) {
			return { ok: false, message: `Identity scope is not allowed here: ${scope}` };
		}
		seen.add(scope);
		scopes.push(scope);
	}

	return { ok: true, value: scopes };
}

export function serializeScopeList(scopes: readonly string[]): string {
	return JSON.stringify(Array.from(new Set(scopes.map((scope) => String(scope).trim()).filter(Boolean))));
}

export function parseStoredScopeList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map((entry) => String(entry).trim()).filter(Boolean);
	}
	if (typeof value !== "string") {
		return [];
	}
	const trimmed = value.trim();
	if (!trimmed) return [];
	try {
		const parsed = JSON.parse(trimmed);
		if (Array.isArray(parsed)) {
			return parsed.map((entry) => String(entry).trim()).filter(Boolean);
		}
	} catch {
		// Fall through to plain text parsing for legacy values.
	}
	return trimmed.split(/[,\s]+/).map((entry) => entry.trim()).filter(Boolean);
}
