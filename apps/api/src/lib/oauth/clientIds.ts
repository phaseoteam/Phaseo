// Phaseo's own OAuth clients. Kept apart from the OAuth service so that route guards can tell
// first-party apps from third-party ones without loading (or, in tests, mocking) the service.
export const CLI_CLIENT_ID = "phaseo_cli";
export const DESKTOP_CLIENT_ID = "phaseo_desktop";
export const LEGACY_CLI_CLIENT_ID = "aistats_cli";
const CLI_CLIENT_IDS = new Set([CLI_CLIENT_ID, LEGACY_CLI_CLIENT_ID]);

export function isFirstPartyCliClient(clientId: string): boolean {
	return CLI_CLIENT_IDS.has(clientId.trim());
}

/** The CLI (current and legacy client IDs) and the desktop app. */
export function isFirstPartyOAuthClient(clientId: string): boolean {
	return isFirstPartyCliClient(clientId) || clientId.trim() === DESKTOP_CLIENT_ID;
}
