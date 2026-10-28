import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { Account } from "../shared/workspace";
import { PHASEO_GATEWAY_ENDPOINT } from "./phaseoOAuth";

/**
 * Signing in to Phaseo itself, as the website and the mobile app do (Phaseo's Supabase Auth), rather than through an
 * OAuth consent screen: the app is Phaseo's own, so its login can do what the website can. The publishable key is
 * public by design; the website sends it to every browser. Model calls still use a gateway key, which the login gets
 * from the API. Every token stays in the main process.
 */
const supabaseUrl = (process.env.PHASEO_SUPABASE_URL ?? "https://xansbgjaduxypzsmjwct.supabase.co").replace(/\/+$/, "");
const publishableKey = process.env.PHASEO_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_8kJxqI3nTKyJzI6Yh4850Q_Nca0aPRq";
const authRoot = `${supabaseUrl}/auth/v1`;
const apiRoot = "https://api.phaseo.app";
const webRoot = "https://phaseo.app";

export const PHASEO_PROVIDERS = ["github", "google", "gitlab"] as const;
export type PhaseoProvider = (typeof PHASEO_PROVIDERS)[number];
/** A Phaseo login: its access token lasts an hour and the refresh token renews it (each refresh replaces both). */
export type PhaseoSession = { accessToken: string; refreshToken: string; expiresAt: number; userId: string; email?: string };

const invalidResponse = "Phaseo returned an invalid sign-in response.";

/** A bounded JSON object from a response, so a misbehaving server can't flood memory or leak a body into an error. */
async function readJson(response: Response): Promise<Record<string, unknown>> {
	const reader = response.body?.getReader();
	if (!reader) return {};
	let bytes = 0; const chunks: Uint8Array[] = [];
	try {
		while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 65_536) { await reader.cancel(); throw new Error(invalidResponse); } chunks.push(value); }
	} finally { reader.releaseLock(); }
	if (!bytes) return {};
	let body: unknown;
	try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error(invalidResponse); }
	if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(invalidResponse);
	return body as Record<string, unknown>;
}

/** What went wrong, in words for the sign-in form; the server's own text never reaches it. */
function authFailure(status: number, body: Record<string, unknown>) {
	const code = String(body.error_code ?? body.code ?? body.error ?? "");
	if (code === "invalid_credentials" || (code === "invalid_grant" && /credentials/i.test(String(body.error_description ?? body.msg ?? "")))) return new Error("That email and password don't match a Phaseo account.");
	if (code === "email_not_confirmed") return new Error("Confirm your email address first: Phaseo sent you a link.");
	if (code === "mfa_verification_failed" || code === "mfa_challenge_expired") return new Error("That code didn't work. Check your authenticator app and try again.");
	if (status === 429 || code.startsWith("over_")) return new Error("Too many attempts. Wait a minute and try again.");
	if (code === "refresh_token_not_found" || code === "refresh_token_already_used" || code === "session_not_found" || code === "session_expired") return new Error("Your Phaseo login has ended. Sign in again.");
	return new Error(`Phaseo sign-in failed (HTTP ${status}). Try again.`);
}

async function auth(path: string, { body, accessToken, method = "POST", fetcher = fetch, signal }: { body?: unknown; accessToken?: string; method?: string; fetcher?: typeof fetch; signal?: AbortSignal }) {
	const response = await fetcher(`${authRoot}${path}`, {
		method, redirect: "error", signal: signal ?? AbortSignal.timeout(20_000),
		headers: { apikey: publishableKey, ...body === undefined ? {} : { "content-type": "application/json" }, ...accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
		...body === undefined ? {} : { body: JSON.stringify(body) },
	});
	const json = await readJson(response);
	if (!response.ok) throw authFailure(response.status, json);
	return json;
}

function sessionFrom(body: Record<string, unknown>): PhaseoSession {
	const user = body.user && typeof body.user === "object" ? body.user as Record<string, unknown> : {};
	const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn } = body;
	if (typeof accessToken !== "string" || !accessToken || accessToken.length > 16_384 || typeof refreshToken !== "string" || !refreshToken || refreshToken.length > 4096
		|| typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 7 * 86_400 || typeof user.id !== "string" || !user.id) throw new Error(invalidResponse);
	return { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000, userId: user.id, ...typeof user.email === "string" && user.email ? { email: user.email } : {} };
}

/** A stored login, or a clear failure for one that's damaged. */
export function parsePhaseoSession(value: string): PhaseoSession {
	let session: Partial<PhaseoSession>;
	try { session = JSON.parse(value) as Partial<PhaseoSession>; } catch { throw new Error("This Phaseo login is damaged. Sign in again."); }
	if (typeof session.accessToken !== "string" || typeof session.refreshToken !== "string" || typeof session.expiresAt !== "number" || typeof session.userId !== "string") throw new Error("This Phaseo login is damaged. Sign in again.");
	return session as PhaseoSession;
}

/**
 * Signs in with GitHub, Google or GitLab in the browser, which returns to a one-time listener on this computer. The
 * code it brings back only works with this sign-in's PKCE verifier, so a code sent there by anything else fails.
 */
export async function browserSignIn({ provider, openBrowser, signal, fetcher = fetch, timeoutMs = 300_000 }: {
	provider: PhaseoProvider; openBrowser: (url: string) => Promise<void>; signal: AbortSignal; fetcher?: typeof fetch; timeoutMs?: number;
}): Promise<PhaseoSession> {
	if (signal.aborted) throw new Error("Sign-in canceled.");
	const verifier = randomBytes(32).toString("base64url");
	const challenge = createHash("sha256").update(verifier).digest("base64url");
	let redirectUri = "";
	let consumed = false;
	let resolveCode!: (code: string) => void;
	let rejectCode!: (error: Error) => void;
	const codeResult = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
	// A browser-launch failure can precede awaiting the callback promise.
	void codeResult.catch(() => {});
	const controller = new AbortController();
	const cancel = () => { controller.abort(); rejectCode(new Error("Sign-in canceled.")); };
	signal.addEventListener("abort", cancel, { once: true });
	const timer = setTimeout(() => { controller.abort(); rejectCode(new Error("Sign-in timed out. Try again.")); }, timeoutMs);
	const server = createServer((request, response) => {
		response.setHeader("Cache-Control", "no-store");
		response.setHeader("Content-Type", "text/plain; charset=utf-8");
		response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
		let url: URL;
		try { if ((request.url?.length ?? 0) > 8192) throw new Error(); url = new URL(request.url ?? "/", "http://127.0.0.1"); } catch { response.writeHead(400); response.end("Invalid sign-in callback."); return; }
		if (!redirectUri || request.method !== "GET" || request.headers.host !== new URL(redirectUri).host || url.pathname !== "/callback" || consumed) {
			response.writeHead(400); response.end("Invalid sign-in callback."); return;
		}
		if (url.searchParams.has("error")) {
			consumed = true; response.writeHead(200); response.end("Sign-in canceled. Return to Phaseo.");
			rejectCode(new Error(url.searchParams.get("error") === "access_denied" ? "Sign-in was declined." : "Phaseo sign-in failed in the browser. Try again.")); return;
		}
		const code = url.searchParams.get("code");
		if (!code || code.length > 4096 || url.searchParams.getAll("code").length !== 1) { response.writeHead(400); response.end("Invalid sign-in callback."); return; }
		consumed = true; response.writeHead(200); response.end("Return to Phaseo to finish signing in."); resolveCode(code);
	});
	try {
		await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
		const address = server.address();
		if (!address || typeof address === "string") throw new Error("Could not start sign-in callback.");
		redirectUri = `http://127.0.0.1:${address.port}/callback`;
		if (signal.aborted || controller.signal.aborted) throw new Error("Sign-in canceled.");
		const authorize = new URL(`${authRoot}/authorize`);
		authorize.search = new URLSearchParams({ provider, redirect_to: redirectUri, code_challenge: challenge, code_challenge_method: "s256" }).toString();
		await openBrowser(authorize.toString());
		const code = await codeResult;
		server.close();
		const session = sessionFrom(await auth("/token?grant_type=pkce", { body: { auth_code: code, code_verifier: verifier }, fetcher, signal: controller.signal }));
		if (controller.signal.aborted) throw new Error("Sign-in canceled.");
		return session;
	} finally {
		clearTimeout(timer); signal.removeEventListener("abort", cancel); controller.abort(); server.close(); server.closeAllConnections();
	}
}

export async function passwordSignIn(email: string, password: string, fetcher: typeof fetch = fetch, signal?: AbortSignal) {
	return sessionFrom(await auth("/token?grant_type=password", { body: { email, password }, fetcher, signal }));
}

/** A fresh access token; the old refresh token stops working, so the caller must keep the new session at once. */
export async function refreshPhaseoSession(refreshToken: string, fetcher: typeof fetch = fetch, signal?: AbortSignal) {
	return sessionFrom(await auth("/token?grant_type=refresh_token", { body: { refresh_token: refreshToken }, fetcher, signal }));
}

/** The authenticator to ask for a code when the account has one and this login hasn't used it, as the website does. */
export async function secondFactor(session: PhaseoSession, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<string | undefined> {
	if (tokenAssurance(session.accessToken) === "aal2") return undefined;
	const user = await auth("/user", { method: "GET", accessToken: session.accessToken, fetcher, signal });
	const factors = Array.isArray(user.factors) ? user.factors as Array<Record<string, unknown>> : [];
	const factor = factors.find(value => value.status === "verified" && value.factor_type === "totp") ?? factors.find(value => value.status === "verified");
	return typeof factor?.id === "string" ? factor.id : undefined;
}

export async function verifySecondFactor(session: PhaseoSession, factorId: string, code: string, fetcher: typeof fetch = fetch, signal?: AbortSignal) {
	const factor = encodeURIComponent(factorId);
	const challenge = await auth(`/factors/${factor}/challenge`, { body: {}, accessToken: session.accessToken, fetcher, signal });
	if (typeof challenge.id !== "string") throw new Error(invalidResponse);
	return sessionFrom(await auth(`/factors/${factor}/verify`, { body: { challenge_id: challenge.id, code }, accessToken: session.accessToken, fetcher, signal }));
}

/** Ends this login on Phaseo's side; best effort, as the app forgets it either way. */
export async function signOutPhaseo(session: PhaseoSession, fetcher: typeof fetch = fetch) {
	await auth("/logout?scope=local", { body: {}, accessToken: session.accessToken, fetcher }).catch(() => undefined);
}

function tokenAssurance(token: string) {
	try { return (JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { aal?: unknown }).aal; } catch { return undefined; }
}

/**
 * The key the app makes model calls with, for this login: in the workspace asked for, else the person's default. It
 * lasts 30 days and the app renews it while it's used.
 */
export async function issuePhaseoKey(session: PhaseoSession, workspaceId?: string, fetcher: typeof fetch = fetch, signal: AbortSignal = AbortSignal.timeout(20_000)) {
	const response = await fetcher(`${apiRoot}/oauth/desktop/key`, {
		method: "POST", redirect: "error", signal,
		headers: { Authorization: `Bearer ${session.accessToken}`, "content-type": "application/json" },
		body: JSON.stringify(workspaceId ? { workspace_id: workspaceId } : {}),
	});
	const body = await readJson(response);
	if (!response.ok) {
		if (response.status === 404 || response.status === 405) throw new Error("Phaseo desktop sign-in isn't available on this server yet.");
		if (body.error === "insufficient_user_authentication") throw new Error("Finish two-factor sign-in first.");
		if (response.status === 403) throw new Error("This login isn't a member of that Phaseo workspace.");
		if (response.status === 401) throw new Error("Your Phaseo login has ended. Sign in again.");
		throw new Error(`Phaseo couldn't set up this app (HTTP ${response.status}). Try again.`);
	}
	const expiresAt = typeof body.expires_at === "string" ? Date.parse(body.expires_at) : Number.NaN;
	if (typeof body.access_token !== "string" || !body.access_token || body.access_token.length > 10_000 || body.token_type !== "Bearer" || body.resource !== PHASEO_GATEWAY_ENDPOINT
		|| typeof body.scope !== "string" || !body.scope.split(" ").includes("gateway:access") || typeof body.workspace_id !== "string" || !body.workspace_id
		|| !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 90 * 86_400_000) throw new Error(invalidResponse);
	return { key: body.access_token, expiresAt: new Date(expiresAt).toISOString(), workspaceId: body.workspace_id };
}

/** Revokes a key the app no longer uses (a sign-in replaced it); best effort, as an unrenewed key ends by itself. */
export async function revokePhaseoKey(key: string, fetcher: typeof fetch = fetch) {
	await fetcher(`${apiRoot}/oauth/revoke`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000), headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: key }) }).catch(() => undefined);
}

/** Who the login belongs to, from the website's own profile: the name they chose, their email and an https photo. */
export async function phaseoAccountProfile(session: PhaseoSession, fetcher: typeof fetch = fetch, signal: AbortSignal = AbortSignal.timeout(15_000)): Promise<NonNullable<Account["profile"]>> {
	const response = await fetcher(`${webRoot}/api/account/settings/profile`, { headers: { Authorization: `Bearer ${session.accessToken}` }, redirect: "error", signal });
	if (!response.ok) throw new Error(`Phaseo couldn't read this account's profile (HTTP ${response.status}).`);
	const body = await readJson(response);
	const profile = body.profile && typeof body.profile === "object" ? body.profile as Record<string, unknown> : undefined;
	if (!profile) throw new Error("Your Phaseo login has ended. Sign in again.");
	const text = (value: unknown, max = 200) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
	const picture = text(profile.avatarUrl, 2048);
	let https: string | undefined;
	try { https = picture && new URL(picture).protocol === "https:" ? picture : undefined; } catch { https = undefined; }
	const name = text(profile.displayName), email = text(profile.email) ?? session.email, givenName = name?.split(/\s+/)[0];
	return { checkedAt: new Date().toISOString(), ...name ? { name } : {}, ...givenName ? { givenName } : {}, ...email ? { email } : {}, ...https ? { picture: https } : {} };
}
