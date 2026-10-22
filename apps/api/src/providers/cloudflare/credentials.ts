// Purpose: Cloudflare Workers AI credentials brought by a workspace (BYOK).
// Why: A Cloudflare BYOK key is saved as JSON with `apiToken` and `accountId`
//      (core/provider-credentials.ts), and Workers AI calls are account-scoped:
//      https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/... with
//      `Authorization: Bearer {api token}`.
//      https://developers.cloudflare.com/workers-ai/get-started/rest-api/
// How: Parse the saved JSON so calls use the customer's token and account.

import type { ResolvedKey } from "../keys";

export type CloudflareByokCredential = { apiToken: string; accountId: string };

/** The customer's token and account for a BYOK key, or null for the gateway key or a plain token. */
export function cloudflareByokCredential(key: ResolvedKey): CloudflareByokCredential | null {
	if (key.source !== "byok") return null;
	const value = key.key.trim();
	if (!value.startsWith("{")) return null;
	try {
		const parsed = JSON.parse(value) as Record<string, unknown>;
		const apiToken = typeof parsed.apiToken === "string" ? parsed.apiToken.trim() : "";
		const accountId = typeof parsed.accountId === "string" ? parsed.accountId.trim() : "";
		return apiToken && accountId ? { apiToken, accountId } : null;
	} catch {
		return null;
	}
}

/** Workers AI base for an account: `/ai/run/{model}` and `/ai/v1/...` sit under it. */
export function cloudflareAccountAiBase(accountId: string): string {
	return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai`;
}

/**
 * Headers for a call on the customer's account: their token, and without the gateway's
 * own AI Gateway id, which names a gateway in Phaseo's account rather than theirs.
 */
export function cloudflareByokHeaders(
	credential: CloudflareByokCredential,
	headers: Record<string, string>,
): Record<string, string> {
	const { "cf-aig-gateway-id": _gatewayId, ...rest } = headers;
	return { ...rest, Authorization: `Bearer ${credential.apiToken}` };
}
