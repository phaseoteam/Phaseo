export function validateSelectedAuthorizationScopes(
	selectedScopes: string[],
	requestedScopes: string[],
): { ok: true; scopes: string[] } | { ok: false; error: string } {
	const selected = Array.from(new Set(selectedScopes.map((scope) => scope.trim()).filter(Boolean)));
	if (selected.length === 0) {
		return { ok: false, error: "Select at least one permission to authorize" };
	}
	const requested = new Set(requestedScopes.map((scope) => scope.trim()).filter(Boolean));
	if (selected.some((scope) => !requested.has(scope))) {
		return { ok: false, error: "Selected permissions do not match the authorization request" };
	}
	return { ok: true, scopes: selected };
}
