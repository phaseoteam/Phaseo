import { apiFetch, getSessionAccessToken, refreshSession } from "../api.js";
import { readSession, writeSession, type Session } from "../session.js";
import type { IntegrationId } from "./types.js";

const KEY_NAMES: Record<string, string> = {
	codex: "Phaseo CLI: Codex API Key",
	"claude-code": "Phaseo CLI: Claude Code API Key",
	opencode: "Phaseo CLI: OpenCode API Key",
	"deepseek-harness": "Phaseo CLI: DeepSeek Harness API Key",
	pi: "Phaseo CLI: Pi API Key",
	"prime-agent": "Phaseo CLI: Prime Agent API Key",
	hermes: "Phaseo CLI: Hermes Agent API Key",
	aider: "Phaseo CLI: Aider API Key",
	cline: "Phaseo CLI: Cline API Key",
	"roo-code": "Phaseo CLI: Roo Code API Key",
	"kilo-code": "Phaseo CLI: Kilo Code API Key",
	"minimax-code": "Phaseo CLI: MiniMax Code API Key",
	continue: "Phaseo CLI: Continue API Key",
	cursor: "Phaseo CLI: Cursor API Key",
	zed: "Phaseo CLI: Zed API Key",
	openclaw: "Phaseo CLI: OpenClaw API Key",
};

function keyName(integration: string): string {
	return KEY_NAMES[integration] ?? `Phaseo CLI: ${integration} API Key`;
}

const LEGACY_KEY_LIFETIME_MS = 24 * 60 * 60 * 1000;
const LEGACY_KEY_REFRESH_WINDOW_MS = 5 * 60 * 1000;

function withoutCredential(session: Session, integration: string): Session {
	const credentials = { ...(session.integrationGatewayCredentials ?? {}) };
	delete credentials[integration];
	return { ...session, integrationGatewayCredentials: credentials };
}

function withoutLegacyCredential(session: Session): Session {
	const {
		integrationGatewayKey: _key,
		integrationGatewayKeyId: _keyId,
		integrationGatewayKeyExpiresAt: _expiresAt,
		...rest
	} = session;
	return rest;
}

export async function getLegacyIntegrationGatewayCredential(): Promise<string> {
	if (process.env.PHASEO_API_KEY) return process.env.PHASEO_API_KEY;
	let session = await getSessionAccessToken();
	if (
		session.integrationGatewayKey &&
		session.integrationGatewayKeyId &&
		(session.integrationGatewayKeyExpiresAt ?? 0) - Date.now() > LEGACY_KEY_REFRESH_WINDOW_MS
	) return session.integrationGatewayKey;
	if (session.integrationGatewayKeyId) {
		await apiFetch(session.apiUrl, `/keys/${encodeURIComponent(session.integrationGatewayKeyId)}`, {
			method: "DELETE",
			accessToken: session.accessToken,
		}).catch(() => undefined);
		session = withoutLegacyCredential(session);
		await writeSession(session);
	}
	const expiresAt = Date.now() + LEGACY_KEY_LIFETIME_MS;
	const body = await apiFetch(session.apiUrl, "/keys", {
		method: "POST",
		accessToken: session.accessToken,
		body: JSON.stringify({
			name: "Phaseo coding-agent integration",
			expires_at: new Date(expiresAt).toISOString(),
		}),
	});
	const key = body?.data?.key;
	const keyId = body?.data?.id;
	if (typeof key !== "string" || !key || typeof keyId !== "string" || !keyId) throw new Error("Phaseo did not return a gateway credential");
	const next = { ...session, integrationGatewayKey: key, integrationGatewayKeyId: keyId, integrationGatewayKeyExpiresAt: expiresAt };
	try {
		await writeSession(next);
	} catch (error) {
		await apiFetch(session.apiUrl, `/keys/${encodeURIComponent(keyId)}`, { method: "DELETE", accessToken: session.accessToken }).catch(() => undefined);
		throw error;
	}
	return key;
}

/** Integration keys are created with a 90-day expiry and a monthly spend limit. */
export const INTEGRATION_KEY_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
/** Default monthly spend limit in USD for integration keys; raise it with `phaseo keys update <id> --limit`. */
export const INTEGRATION_KEY_MONTHLY_LIMIT_USD = 100;

type IntegrationCredential = NonNullable<Session["integrationGatewayCredentials"]>[string];

/** An expired key no longer works, so its record is dropped and a new key is created. Keys without a recorded expiry are kept. */
function isExpired(credential: IntegrationCredential | undefined): boolean {
	return credential?.expiresAt !== undefined && credential.expiresAt <= Date.now();
}

export async function getIntegrationGatewayCredential(integration: IntegrationId | string): Promise<string> {
	if (process.env.PHASEO_API_KEY) return process.env.PHASEO_API_KEY;
	let session = await getSessionAccessToken();
	const existing = session.integrationGatewayCredentials?.[integration];
	if (existing && !isExpired(existing)) return existing.key;
	if (existing) {
		session = withoutCredential(session, integration);
		await writeSession(session);
	}
	const expiresAt = Date.now() + INTEGRATION_KEY_LIFETIME_MS;
	const body = await apiFetch(session.apiUrl, "/keys", {
		method: "POST",
		accessToken: session.accessToken,
		body: JSON.stringify({
			name: keyName(integration),
			expires_at: new Date(expiresAt).toISOString(),
			limit: INTEGRATION_KEY_MONTHLY_LIMIT_USD,
			limit_reset: "monthly",
		}),
	});
	const key = body?.data?.key;
	const keyId = body?.data?.id;
	if (typeof key !== "string" || !key || typeof keyId !== "string" || !keyId) throw new Error("Phaseo did not return a gateway credential");
	const next = {
		...session,
		integrationGatewayCredentials: { ...(session.integrationGatewayCredentials ?? {}), [integration]: { key, keyId, expiresAt } },
	};
	try {
		await writeSession(next);
	} catch (error) {
		await apiFetch(session.apiUrl, `/keys/${encodeURIComponent(keyId)}`, { method: "DELETE", accessToken: session.accessToken }).catch(() => undefined);
		throw error;
	}
	return key;
}

type SessionIdentity = { userId: string; workspaceId: string };

async function sessionIdentity(apiUrl: string, accessToken: string): Promise<SessionIdentity | null> {
	try {
		const body = await apiFetch(apiUrl, "/me", { accessToken });
		const userId = body?.data?.user?.id;
		const workspaceId = body?.data?.current_workspace_id;
		return typeof userId === "string" && userId && typeof workspaceId === "string" && workspaceId ? { userId, workspaceId } : null;
	} catch {
		return null;
	}
}

/**
 * Integration keys to keep when `phaseo login` replaces a session. Keys are carried over only when
 * the new session is for the same API root, account and workspace (checked with GET /v1/me on both
 * sessions); otherwise they are revoked with the old session's token first. Revocation is best
 * effort and failures are returned for reporting.
 */
export async function integrationCredentialsForNewLogin(
	previous: Session | null,
	next: { apiUrl: string; accessToken: string },
): Promise<{ carried: Partial<Session>; revokeFailures: string[] }> {
	if (!previous) return { carried: {}, revokeFailures: [] };
	const credentials = previous.integrationGatewayCredentials ?? {};
	const keyIds = [
		...Object.values(credentials).map((credential) => credential.keyId),
		...(previous.integrationGatewayKeyId ? [previous.integrationGatewayKeyId] : []),
	];
	if (keyIds.length === 0) return { carried: {}, revokeFailures: [] };
	let accessToken = previous.accessToken;
	if (previous.expiresAt - Date.now() < 60_000) {
		accessToken = await refreshSession(previous).then((session) => session.accessToken).catch(() => accessToken);
	}
	if (previous.apiUrl === next.apiUrl) {
		const [before, after] = await Promise.all([
			sessionIdentity(previous.apiUrl, accessToken),
			sessionIdentity(next.apiUrl, next.accessToken),
		]);
		if (before && after && before.userId === after.userId && before.workspaceId === after.workspaceId) {
			return {
				carried: {
					...(Object.keys(credentials).length > 0 ? { integrationGatewayCredentials: credentials } : {}),
					...(previous.integrationGatewayKey ? {
						integrationGatewayKey: previous.integrationGatewayKey,
						integrationGatewayKeyId: previous.integrationGatewayKeyId,
						integrationGatewayKeyExpiresAt: previous.integrationGatewayKeyExpiresAt,
					} : {}),
				},
				revokeFailures: [],
			};
		}
	}
	const revokeFailures: string[] = [];
	for (const keyId of keyIds) {
		try {
			await apiFetch(previous.apiUrl, `/keys/${encodeURIComponent(keyId)}`, { method: "DELETE", accessToken });
		} catch {
			revokeFailures.push(keyId);
		}
	}
	return { carried: {}, revokeFailures };
}

export async function hasIntegrationGatewayCredential(integration: IntegrationId | string): Promise<boolean> {
	if (process.env.PHASEO_API_KEY) return true;
	const existing = (await readSession())?.integrationGatewayCredentials?.[integration];
	return Boolean(existing && !isExpired(existing));
}

export async function revokeIntegrationGatewayCredential(integration?: IntegrationId | string): Promise<boolean> {
	const stored = await readSession();
	if (!stored) return false;
	const targets = integration
		? [[integration, stored.integrationGatewayCredentials?.[integration]] as const]
		: Object.entries(stored.integrationGatewayCredentials ?? {});
	const active = targets.filter((entry): entry is [string, { key: string; keyId: string }] => Boolean(entry[1]));
	const revokeLegacy = integration === undefined && Boolean(stored.integrationGatewayKeyId);
	if (active.length === 0 && !revokeLegacy) return false;
	let session = await getSessionAccessToken();
	for (const [id, credential] of active) {
		await apiFetch(session.apiUrl, `/keys/${encodeURIComponent(credential.keyId)}`, { method: "DELETE", accessToken: session.accessToken });
		session = withoutCredential(session, id);
	}
	if (revokeLegacy && session.integrationGatewayKeyId) {
		await apiFetch(session.apiUrl, `/keys/${encodeURIComponent(session.integrationGatewayKeyId)}`, { method: "DELETE", accessToken: session.accessToken });
		session = withoutLegacyCredential(session);
	}
	await writeSession(session);
	return true;
}
