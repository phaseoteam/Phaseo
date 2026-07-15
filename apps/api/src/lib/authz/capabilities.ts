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
	GUARDRAILS_READ: "guardrails:read",
	GUARDRAILS_WRITE: "guardrails:write",
	GUARDRAILS_DELETE: "guardrails:delete",
	MANAGEMENT_KEYS_READ: "management_keys:read",
	MANAGEMENT_KEYS_WRITE: "management_keys:write",
	MANAGEMENT_KEYS_DELETE: "management_keys:delete",
	OAUTH_CLIENTS_READ: "oauth_clients:read",
	OAUTH_CLIENTS_WRITE: "oauth_clients:write",
	OAUTH_CLIENTS_DELETE: "oauth_clients:delete",
} as const;

export const CONTROL_CAPABILITIES = Object.freeze(Object.values(CAPABILITIES));

export const DEFAULT_CLI_OAUTH_CAPABILITIES = Object.freeze([
	...IDENTITY_SCOPES,
	...CONTROL_CAPABILITIES,
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
