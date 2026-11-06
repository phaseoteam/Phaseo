import { createHash, randomBytes } from "node:crypto";
import { apiFetch, getSessionAccessToken, isTrustedBrowserUrl, refreshSession, v1Url } from "../api.js";
import { openUrl } from "../browser.js";
import { readSession, writeSession, type Session } from "../session.js";
import type { IntegrationId } from "./types.js";

const KEY_NAMES: Record<string, string> = {
	codex: "Phaseo CLI: Codex API Key",
	"claude-code": "Phaseo CLI: Claude Code API Key",
	opencode: "Phaseo CLI: OpenCode API Key",
	fx: "Phaseo CLI: fx API Key",
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

/**
 * The shared key older helper configurations read with `phaseo integrations credential` (no integration).
 * A CLI sign-in can no longer create keys, so an expired one isn't replaced: setup approves a dedicated key
 * per integration instead.
 */
export async function getLegacyIntegrationGatewayCredential(): Promise<string> {
	if (process.env.PHASEO_API_KEY) return process.env.PHASEO_API_KEY;
	const session = await getSessionAccessToken();
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
		await writeSession(withoutLegacyCredential(session));
	}
	throw new Error("The shared coding-agent key has expired and the CLI can't create keys. Run `phaseo setup <agent>` again (for example `phaseo setup codex`) to approve a dedicated key in your browser.");
}

/** Integration keys are created with a 90-day expiry and a monthly spend limit. */
export const INTEGRATION_KEY_LIFETIME_DAYS = 90;
export const INTEGRATION_KEY_LIFETIME_MS = INTEGRATION_KEY_LIFETIME_DAYS * 24 * 60 * 60 * 1000;
/** Default monthly spend limit in USD for integration keys; change it in the dashboard (or `phaseo keys update <id> --limit`). */
export const INTEGRATION_KEY_MONTHLY_LIMIT_USD = 100;

type IntegrationCredential = NonNullable<Session["integrationGatewayCredentials"]>[string];

/** An expired key no longer works, so its record is dropped and a new key is asked for. Keys without a recorded expiry are kept. */
function isExpired(credential: IntegrationCredential | undefined): boolean {
	return credential?.expiresAt !== undefined && credential.expiresAt <= Date.now();
}

/** How the browser approval talks to the person; tests replace these. */
export type KeyApprovalHooks = {
	/** Writes a line for the person (stderr by default, so stdout stays clean for --json and credential helpers). */
	notify?: (line: string) => void;
	/** Opens the approval page; false when no browser could be opened. */
	open?: (url: string) => boolean;
	sleep?: (ms: number) => Promise<void>;
};

export type IntegrationCredentialOptions = {
	/** A key made in the dashboard, pasted with --key. It is checked, stored and never revoked by the CLI. */
	existingKey?: string;
	/** Ask for a new key with browser approval when none is stored (default). Credential helpers pass false. */
	approve?: boolean;
	hooks?: KeyApprovalHooks;
};

function base64Url(bytes: Buffer): string {
	return bytes.toString("base64url");
}

/** The dashboard key a person pasted: the gateway's GET /v1/key answers with the key's own id when it's valid. */
async function describeExistingKey(apiUrl: string, key: string): Promise<{ keyId: string; expiresAt?: number }> {
	const trimmed = key.trim();
	if (!/^(phaseo|aistats)_v1_sk_[A-Za-z0-9]+_[A-Za-z0-9_]+$/.test(trimmed)) {
		throw new Error("--key must be a Phaseo API key (phaseo_v1_sk_…) from Settings, API Keys in the dashboard");
	}
	let body: any;
	try {
		body = await apiFetch(apiUrl, "/key", { accessToken: trimmed });
	} catch (error) {
		throw new Error(`Phaseo didn't accept that key: ${error instanceof Error ? error.message : String(error)}`);
	}
	const keyId = body?.data?.id;
	if (typeof keyId !== "string" || !keyId) throw new Error("Phaseo didn't accept that key");
	const expires = Date.parse(String(body?.data?.expires_at ?? ""));
	return { keyId, ...(Number.isFinite(expires) ? { expiresAt: expires } : {}) };
}

function usd(value: number): string {
	return value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function postKeyRequest(apiUrl: string, path: string, accessToken: string, body: unknown): Promise<{ status: number; body: any }> {
	const response = await fetch(v1Url(apiUrl, path), {
		method: "POST",
		headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
		body: JSON.stringify(body),
	});
	const text = await response.text();
	let parsed: any = null;
	try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
	return { status: response.status, body: parsed };
}

function errorMessage(body: any, fallback: string): string {
	return typeof body?.message === "string" ? body.message : typeof body?.error === "string" ? body.error : fallback;
}

/**
 * Asks Phaseo for a new key for this integration and waits while the person approves it in the browser.
 * The CLI sign-in can't create keys itself (anyone can start a sign-in with the CLI's public client id), so
 * the request goes to POST /v1/key-requests with a PKCE challenge, the person approves the exact name,
 * limits and lifetime in the dashboard, and the CLI collects the key once with its verifier.
 */
async function requestApprovedKey(integration: string, hooks: KeyApprovalHooks = {}): Promise<{ key: string; keyId: string; expiresAt?: number }> {
	const notify = hooks.notify ?? ((line: string) => process.stderr.write(`${line}\n`));
	const open = hooks.open ?? openUrl;
	const sleep = hooks.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const verifier = base64Url(randomBytes(32));
	const challenge = base64Url(createHash("sha256").update(verifier).digest());
	const name = keyName(integration);

	let session = await getSessionAccessToken();
	const created = await postKeyRequest(session.apiUrl, "/key-requests", session.accessToken, {
		name,
		agent: integration,
		limits: { monthly_cost_usd: INTEGRATION_KEY_MONTHLY_LIMIT_USD },
		expires_in_days: INTEGRATION_KEY_LIFETIME_DAYS,
		code_challenge: challenge,
		code_challenge_method: "S256",
	});
	if (created.status !== 201 || typeof created.body?.request_id !== "string" || typeof created.body?.approval_url !== "string") {
		throw new Error(`Couldn't ask Phaseo for a key: ${errorMessage(created.body, `HTTP ${created.status}`)}`);
	}
	const requestId: string = created.body.request_id;
	const approvalUrl: string = created.body.approval_url;
	let interval = Math.max(1, Number(created.body.poll_interval) || 3) * 1000;
	const expiresAt = Date.parse(String(created.body.expires_at ?? "")) || Date.now() + 10 * 60_000;

	notify(`Approve the new key in your browser: ${approvalUrl}`);
	notify(`  ${name} · ${usd(INTEGRATION_KEY_MONTHLY_LIMIT_USD)} monthly limit · expires ${INTEGRATION_KEY_LIFETIME_DAYS} days after approval`);
	const opened = isTrustedBrowserUrl(approvalUrl) && open(approvalUrl);
	notify(opened ? "Opened the page. Waiting for approval (the request expires in 10 minutes)…" : "Open that link in a browser signed in to Phaseo. Waiting for approval (the request expires in 10 minutes)…");

	// Poll until approved, denied or expired. The extra minute covers a key approved just before expiry.
	while (Date.now() < expiresAt + 60_000) {
		await sleep(interval);
		session = await getSessionAccessToken();
		const polled = await postKeyRequest(session.apiUrl, `/key-requests/${encodeURIComponent(requestId)}/token`, session.accessToken, { code_verifier: verifier });
		if (polled.status === 429) {
			interval += 2000;
			continue;
		}
		if (polled.status !== 200) throw new Error(`Couldn't collect the key: ${errorMessage(polled.body, `HTTP ${polled.status}`)}`);
		const status = polled.body?.status;
		if (status === "pending") continue;
		if (status === "approved") {
			const key = polled.body?.key;
			const keyId = polled.body?.key_id;
			if (typeof key !== "string" || !key || typeof keyId !== "string" || !keyId) throw new Error("Phaseo did not return the approved key");
			const keyExpires = Date.parse(String(polled.body?.expires_at ?? ""));
			return { key, keyId, ...(Number.isFinite(keyExpires) ? { expiresAt: keyExpires } : {}) };
		}
		if (status === "denied") throw new Error("The key request was denied in the browser. Nothing was created. Run setup again to ask for a new key, or pass a key from the dashboard with --key.");
		if (status === "expired") throw new Error("The key request expired before it was approved. Run setup again to ask for a new key, or pass a key from the dashboard with --key.");
		throw new Error(errorMessage(polled.body, "The key request ended without a key. Run setup again."));
	}
	throw new Error("The key request expired before it was approved. Run setup again to ask for a new key, or pass a key from the dashboard with --key.");
}

/**
 * The key this integration uses: PHASEO_API_KEY, a pasted dashboard key, the stored one, or a new key the
 * person approves in the browser (setup and runners only; credential helpers can't wait for a browser).
 */
export async function getIntegrationGatewayCredential(integration: IntegrationId | string, options: IntegrationCredentialOptions = {}): Promise<string> {
	if (process.env.PHASEO_API_KEY) return process.env.PHASEO_API_KEY;
	let session = await getSessionAccessToken();
	if (options.existingKey !== undefined) {
		const key = options.existingKey.trim();
		const described = await describeExistingKey(session.apiUrl, key);
		await writeSession({
			...session,
			integrationGatewayCredentials: { ...(session.integrationGatewayCredentials ?? {}), [integration]: { key, ...described, external: true } },
		});
		return key;
	}
	const existing = session.integrationGatewayCredentials?.[integration];
	if (existing && !isExpired(existing)) return existing.key;
	if (existing) {
		session = withoutCredential(session, integration);
		await writeSession(session);
	}
	if (options.approve === false) {
		throw new Error(`No Phaseo key is set up for ${integration}${existing ? " (the last one expired)" : ""}. Run \`phaseo setup ${integration}\` to approve one in your browser, or pass a key from the dashboard with --key.`);
	}
	const approved = await requestApprovedKey(integration, options.hooks);
	const latest = await getSessionAccessToken();
	await writeSession({
		...latest,
		integrationGatewayCredentials: { ...(latest.integrationGatewayCredentials ?? {}), [integration]: { key: approved.key, keyId: approved.keyId, ...(approved.expiresAt !== undefined ? { expiresAt: approved.expiresAt } : {}) } },
	});
	return approved.key;
}

/**
 * --key <key> uses a key made in the dashboard instead of asking for one; --key-stdin reads it from stdin so
 * it stays out of shell history.
 */
export async function readKeyFlag(flags: Record<string, string | boolean>, stdin: AsyncIterable<string | Buffer> = process.stdin): Promise<string | undefined> {
	const value = flags.key;
	if (flags["key-stdin"] === true || flags["key-stdin"] === "true" || flags["key-stdin"] === "1") {
		if (value !== undefined) throw new Error("Use --key or --key-stdin, not both");
		const chunks: Buffer[] = [];
		for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
		const key = Buffer.concat(chunks).toString("utf8").trim();
		if (!key) throw new Error("--key-stdin read nothing from stdin");
		return key;
	}
	if (value === undefined) return undefined;
	if (typeof value !== "string" || !value.trim()) throw new Error("--key needs a Phaseo API key from Settings, API Keys (or use --key-stdin)");
	return value.trim();
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
 * sessions); otherwise the keys the CLI got are revoked with the old session's token first, and keys pasted
 * with --key are only forgotten. Revocation is best effort and failures are returned for reporting.
 */
export async function integrationCredentialsForNewLogin(
	previous: Session | null,
	next: { apiUrl: string; accessToken: string },
): Promise<{ carried: Partial<Session>; revokeFailures: string[] }> {
	if (!previous) return { carried: {}, revokeFailures: [] };
	const credentials = previous.integrationGatewayCredentials ?? {};
	const keyIds = [
		...Object.values(credentials).filter((credential) => !credential.external).map((credential) => credential.keyId),
		...(previous.integrationGatewayKeyId ? [previous.integrationGatewayKeyId] : []),
	];
	if (keyIds.length === 0 && Object.keys(credentials).length === 0) return { carried: {}, revokeFailures: [] };
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

/** Forgets integration keys and revokes the ones the CLI got; a key pasted with --key stays in the dashboard. */
export async function revokeIntegrationGatewayCredential(integration?: IntegrationId | string): Promise<boolean> {
	const stored = await readSession();
	if (!stored) return false;
	const targets = integration
		? [[integration, stored.integrationGatewayCredentials?.[integration]] as const]
		: Object.entries(stored.integrationGatewayCredentials ?? {});
	const active = targets.filter((entry): entry is [string, IntegrationCredential] => Boolean(entry[1]));
	const revokeLegacy = integration === undefined && Boolean(stored.integrationGatewayKeyId);
	if (active.length === 0 && !revokeLegacy) return false;
	let session = await getSessionAccessToken();
	for (const [id, credential] of active) {
		if (!credential.external) {
			await apiFetch(session.apiUrl, `/keys/${encodeURIComponent(credential.keyId)}`, { method: "DELETE", accessToken: session.accessToken });
		}
		session = withoutCredential(session, id);
	}
	if (revokeLegacy && session.integrationGatewayKeyId) {
		await apiFetch(session.apiUrl, `/keys/${encodeURIComponent(session.integrationGatewayKeyId)}`, { method: "DELETE", accessToken: session.accessToken });
		session = withoutLegacyCredential(session);
	}
	await writeSession(session);
	return true;
}

