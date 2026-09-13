import { apiFetch, getSessionAccessToken } from "../api.js";
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

export async function getIntegrationGatewayCredential(integration: IntegrationId | string): Promise<string> {
	if (process.env.PHASEO_API_KEY) return process.env.PHASEO_API_KEY;
	const session = await getSessionAccessToken();
	const existing = session.integrationGatewayCredentials?.[integration];
	if (existing) return existing.key;
	const body = await apiFetch(session.apiUrl, "/keys", {
		method: "POST",
		accessToken: session.accessToken,
		body: JSON.stringify({ name: keyName(integration) }),
	});
	const key = body?.data?.key;
	const keyId = body?.data?.id;
	if (typeof key !== "string" || !key || typeof keyId !== "string" || !keyId) throw new Error("Phaseo did not return a gateway credential");
	const next = {
		...session,
		integrationGatewayCredentials: { ...(session.integrationGatewayCredentials ?? {}), [integration]: { key, keyId } },
	};
	try {
		await writeSession(next);
	} catch (error) {
		await apiFetch(session.apiUrl, `/keys/${encodeURIComponent(keyId)}`, { method: "DELETE", accessToken: session.accessToken }).catch(() => undefined);
		throw error;
	}
	return key;
}

export async function hasIntegrationGatewayCredential(integration: IntegrationId | string): Promise<boolean> {
	if (process.env.PHASEO_API_KEY) return true;
	return Boolean((await readSession())?.integrationGatewayCredentials?.[integration]);
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
