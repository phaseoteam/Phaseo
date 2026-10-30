// Only errors translated at the request boundary may expose their message in the UI.
// Browser/network/parsing errors use the caller's translated fallback.
export class LocalizedRequestError extends Error {}

export function localizedRequestErrorMessage(error: unknown, fallback: string): string {
	return error instanceof LocalizedRequestError ? error.message : fallback;
}
