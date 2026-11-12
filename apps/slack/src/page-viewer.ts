import { userFacts } from "./access";
import { botToken, type Deps } from "./events";
import { appClientCredentials, loadInstallation, type Installation } from "./installations";
import { base64UrlDecode, base64UrlEncode, signSlackToken, verifySlackToken } from "./lib/slack-secrets";
import { cleanPageHtml } from "./page-html";
import { effectivePageAccess, PAGE_ID_PATTERN, pageStoreByKey, pagesOrigin, pageUrl, STORE_KEY_PATTERN } from "./pages";
import { usersInfo, type SlackUser } from "./slack-api";

// Serving shared pages (pages.ts) at /p/<store>/<page>, and Sign in with Slack for
// the pages shared with a Slack workspace.
//
// A page is the agent's HTML, so it is never a document of its own, and it is
// static: HTML and CSS, without scripts or links. The response is a page of this
// Worker's that holds nothing but an iframe, whose srcdoc is the page cleaned
// again (page-html.ts; it was cleaned when published) and whose sandbox allows
// nothing: no scripts, so nothing can build a URL or reach WebRTC, an opaque
// origin with no cookies or storage, and no pop-ups, forms or top navigation.
// The srcdoc document inherits the outer page's PAGE_CSP, whose fetch
// directives stop it loading anything (only inline styles and data: images),
// and whose frame-src 'none' blocks any navigation of the frame. The cleaning
// removes what CSP and the sandbox can't stop on their own: <link rel=prerender>
// (Chromium fetches it whatever the policy), and links and refreshes, whose
// host Chromium looks up even when frame-src blocks the navigation. See the
// README. Nothing is cached and no referrer is sent, so the link stays out of
// other sites' logs.
//
// A workspace page needs a session for its installation: a signed cookie for
// /p/ that lasts SESSION_TTL_SECONDS. Without one, the viewer is sent to Slack's
// OpenID Connect sign-in (Sign in with Slack) with the client credentials of the
// app the installation uses, and comes back to /p/signin. The sign-in is bound
// to the browser by a short-lived cookie that also holds the page to return to,
// so the page's id never goes to Slack. The ID token comes straight from Slack's
// token endpoint over TLS, which OpenID Connect accepts in place of checking its
// signature; its issuer, audience, expiry and nonce are checked. Then users.info,
// with the installation's bot token, decides membership like the agent does for
// answers: no bots, nobody from another organisation, no deactivated accounts,
// and guests only where the installation allows them. A session is checked
// again on every view: a guest's ends once guests aren't allowed, and users.info
// is asked again once its last answer is SESSION_RECHECK_MS old (at most one
// call per view), so someone who left the workspace loses access within minutes.

/** The outer page's policy, which the page in its srcdoc frame inherits. */
export const PAGE_CSP = [
	"default-src 'none'",
	"style-src 'unsafe-inline'",
	"img-src data:",
	"connect-src 'none'",
	"frame-src 'none'",
	"child-src 'none'",
	"form-action 'none'",
	"frame-ancestors 'none'",
	"base-uri 'none'",
].join("; ");
/** The page's frame allows nothing: no scripts, same origin, top navigation, pop-ups or forms. */
export const PAGE_SANDBOX = "";
/** This Worker's own messages: no scripts at all. */
const MESSAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'";
const COMMON_HEADERS: Record<string, string> = {
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "no-referrer",
	"Cache-Control": "private, no-store",
	"X-Frame-Options": "DENY",
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Resource-Policy": "same-origin",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-read=()",
	"X-Robots-Tag": "noindex, nofollow, noarchive",
};

export const SIGN_IN_PATH = "/p/signin";
export const SESSION_COOKIE = "__Secure-phaseo_page_session";
export const SIGN_IN_COOKIE = "__Secure-phaseo_page_signin";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
/** How old a session's last users.info answer may be before a view asks Slack again. */
export const SESSION_RECHECK_MS = 10 * 60_000;
const SIGN_IN_TTL_SECONDS = 10 * 60;
const COOKIE_PATH = "/p/";
const SLACK_AUTHORIZE_URL = "https://slack.com/openid/connect/authorize";
const SLACK_TOKEN_URL = "https://slack.com/api/openid.connect.token";
const SLACK_ISSUER = "https://slack.com";
const TOKEN_TIMEOUT_MS = 10_000;
const USER_PATTERN = /^[UW][A-Z0-9]{2,31}$/;
const OAUTH_CODE_PATTERN = /^[A-Za-z0-9._-]{1,512}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
/** Link unfurlers and crawlers: they get a generic page, and count no view. */
const PREVIEW_AGENTS = /Slackbot|Slack-ImgProxy|facebookexternalhit|Twitterbot|Discordbot|LinkedInBot|WhatsApp|TelegramBot|Googlebot|bingbot/i;

export type ViewerDeps = Deps & { fetchImpl?: typeof fetch };

type SignInState = { browser: string; oidc: string };
/** guest and checked_at are from the last users.info answer (sessions from before them have neither). */
type Session = { installation_id: string; slack_user_id: string; guest?: boolean; checked_at?: number };
type Refusal = "outside" | "guest";

function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function randomNonce(): string {
	return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * A page, cleaned again whatever stored it (and by the rules in force now), in
 * the sandboxed frame of a page that holds nothing else. A page that no longer
 * passes is not shown.
 */
export function pageResponse(page: { title: string; html: string }, headers: Record<string, string> = {}): Response {
	const cleaned = cleanPageHtml(page.html);
	if (cleaned.status !== "ok") return messagePage(410, "Page unavailable", "This page can't be shown any more.", undefined, headers);
	const body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(page.title)}</title>`
		+ "<style>html,body{height:100%;margin:0}iframe{display:block;width:100%;height:100%;border:0}</style></head>"
		+ `<body><iframe sandbox="${PAGE_SANDBOX}" title="${escapeHtml(page.title)}" srcdoc="${escapeHtml(cleaned.html)}"></iframe></body></html>`;
	return new Response(body, { status: 200, headers: { ...COMMON_HEADERS, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": PAGE_CSP, ...headers } });
}

/** One of this Worker's own short pages: not found, sign-in problems. */
export function messagePage(status: number, title: string, text: string, link?: { href: string; label: string }, headers: Record<string, string> = {}): Response {
	const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>`
		+ "<style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:15vh auto;padding:0 1.5rem;color:#1f2937}h1{font-size:1.25rem}a{color:#0069a8}</style></head>"
		+ `<body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p>${link ? `<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p>` : ""}<p><small>Phaseo agent</small></p></body></html>`;
	return new Response(body, { status, headers: { ...COMMON_HEADERS, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": MESSAGE_CSP, ...headers } });
}

function notFound(): Response {
	return messagePage(404, "Page not found", "This page doesn't exist, has expired or was deleted.");
}

function unavailable(): Response {
	return messagePage(503, "Page unavailable", "This page can't be shown right now. Please try again in a minute.");
}

function cookies(request: Request): Map<string, string> {
	const map = new Map<string, string>();
	for (const part of (request.headers.get("cookie") ?? "").split(";")) {
		const index = part.indexOf("=");
		if (index > 0) map.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
	}
	return map;
}

function setCookie(name: string, value: string, maxAgeSeconds: number): string {
	return `${name}=${value}; Path=${COOKIE_PATH}; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

async function readSession(deps: ViewerDeps, request: Request): Promise<(Session & { exp: number }) | null> {
	const token = cookies(request).get(SESSION_COOKIE);
	if (!token) return null;
	const verified = await verifySlackToken<Session>(deps.env, "page_session", token, deps.now());
	return verified.ok ? verified.payload : null;
}

/** users.info for a viewer with the installation's bot token: the user, null when Slack has none, or "unavailable". */
async function lookupViewer(deps: ViewerDeps, installation: Installation, slackUserId: string): Promise<SlackUser | null | "unavailable"> {
	const token = await botToken(deps, installation).catch(() => null);
	const user = token ? await usersInfo(deps.slack(token), slackUserId) : null;
	if (!user || (user.ok === false && user.error !== "user_not_found")) return "unavailable";
	return user.ok ? user.data : null;
}

/** Whether someone may view the installation's workspace pages, like answers decide it, and whether they are a guest. */
function viewerAccess(user: SlackUser | null, installation: Installation): { refused: Refusal } | { guest: boolean } {
	const facts = user && user.deleted !== true ? userFacts(user, installation) : null;
	if (!facts || facts.isBot || facts.isExternal) return { refused: "outside" };
	if (facts.isGuest && !installation.allow_guests) return { refused: "guest" };
	return { guest: facts.isGuest };
}

function refusedPage(reason: Refusal, headers: Record<string, string>): Response {
	return messagePage(403, "Not shared with you", reason === "guest"
		? "This page is shared with the members of a Slack workspace, and not with its guests."
		: "This page is shared with the people of another Slack workspace. Sign in with that workspace to view it.", undefined, headers);
}

async function sessionCookie(deps: ViewerDeps, session: Session, ttlSeconds: number, now: number): Promise<string> {
	return setCookie(SESSION_COOKIE, await signSlackToken(deps.env, "page_session", session, ttlSeconds, now), ttlSeconds);
}

/**
 * Whether a session may still view the installation's workspace pages: the
 * headers to serve the page with (a renewed cookie, after asking Slack again), or
 * the response to send instead. A renewed session ends when the old one would.
 */
async function recheckSession(deps: ViewerDeps, installation: Installation, session: Session & { exp: number }, now: number): Promise<Record<string, string> | Response> {
	const clearSession = { "Set-Cookie": setCookie(SESSION_COOKIE, "", 0) };
	if (session.guest === true && !installation.allow_guests) return refusedPage("guest", clearSession);
	const checkedAt = session.checked_at;
	if (typeof checkedAt === "number" && checkedAt <= now && now - checkedAt < SESSION_RECHECK_MS) return {};
	const user = await lookupViewer(deps, installation, session.slack_user_id);
	if (user === "unavailable") return messagePage(503, "Page unavailable", "Slack couldn't confirm who you are just now. Please try again in a minute.");
	const access = viewerAccess(user, installation);
	if ("refused" in access) {
		console.log("[slack-agent] page session ended", { installationId: installation.id, reason: access.refused });
		return refusedPage(access.refused, clearSession);
	}
	const renewed: Session = { installation_id: installation.id, slack_user_id: session.slack_user_id, guest: access.guest, checked_at: now };
	return { "Set-Cookie": await sessionCookie(deps, renewed, session.exp - Math.floor(now / 1000), now) };
}

/** GET /p/:store/:page */
export async function servePage(deps: ViewerDeps, request: Request, storeKey: string, pageId: string): Promise<Response> {
	if (!pagesOrigin(deps.env)) return notFound();
	// Unfurlers never see a page, or whether it exists.
	if (PREVIEW_AGENTS.test(request.headers.get("user-agent") ?? "")) return messagePage(200, "Shared page", "A page shared by the Phaseo agent. Open the link in a browser to view it.");
	const store = PAGE_ID_PATTERN.test(pageId) ? pageStoreByKey(deps.env, storeKey) : null;
	if (!store) return notFound();
	const now = deps.now();
	const page = await store.page(pageId, now);
	if (!page) return notFound();
	let installation: Installation | null;
	try {
		installation = await loadInstallation(deps.db, page.installationId);
	} catch {
		return unavailable();
	}
	if (!installation) {
		// Uninstalled: the store goes too.
		await store.removeAll();
		console.log("[slack-agent] pages deleted after uninstall", { installationId: page.installationId });
		return notFound();
	}
	let headers: Record<string, string> = {};
	if (effectivePageAccess(page.access, installation) === "workspace") {
		const session = await readSession(deps, request);
		if (!session || session.installation_id !== installation.id) return startSignIn(deps, installation, storeKey, pageId);
		const checked = await recheckSession(deps, installation, session, now);
		if (checked instanceof Response) return checked;
		headers = checked;
	}
	const response = pageResponse(page, headers);
	if (request.method === "GET" && response.status === 200) await store.recordView(pageId);
	return response;
}

/** Sends the viewer to Sign in with Slack for the installation's workspace. */
async function startSignIn(deps: ViewerDeps, installation: Installation, storeKey: string, pageId: string): Promise<Response> {
	const origin = pagesOrigin(deps.env)!;
	const credentials = await appClientCredentials(deps.env, deps.db, installation).catch(() => null);
	if (!credentials) {
		return messagePage(403, "Sign-in needed", "This page is shared with people in a Slack workspace, but signing in with Slack isn't set up for it. Ask a Phaseo admin of the workspace.");
	}
	const state: SignInState = { browser: randomNonce(), oidc: randomNonce() };
	const url = new URL(SLACK_AUTHORIZE_URL);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("scope", "openid");
	url.searchParams.set("client_id", credentials.clientId);
	url.searchParams.set("redirect_uri", `${origin}${SIGN_IN_PATH}`);
	url.searchParams.set("state", await signSlackToken(deps.env, "page_signin", state, SIGN_IN_TTL_SECONDS, deps.now()));
	url.searchParams.set("nonce", state.oidc);
	if (installation.team_id) url.searchParams.set("team", installation.team_id);
	return new Response(null, {
		status: 302,
		headers: {
			...COMMON_HEADERS,
			Location: url.toString(),
			// The browser's half of the sign-in, and the page to return to; only ever sent back to /p/.
			"Set-Cookie": setCookie(SIGN_IN_COOKIE, `${state.browser}~${storeKey}~${pageId}`, SIGN_IN_TTL_SECONDS),
		},
	});
}

type IdClaims = { iss?: unknown; aud?: unknown; exp?: unknown; nonce?: unknown; sub?: unknown; "https://slack.com/user_id"?: unknown };

/** The ID token's claims. Its signature isn't checked: it came straight from Slack's token endpoint over TLS. */
function idTokenClaims(token: string): IdClaims | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	try {
		const claims: unknown = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
		return claims && typeof claims === "object" && !Array.isArray(claims) ? claims as IdClaims : null;
	} catch {
		return null;
	}
}

/** The Slack user the ID token is for, once its issuer, audience, expiry and nonce check out. */
export function signedInUser(claims: IdClaims | null, expected: { clientId: string; nonce: string; now: number }): string | null {
	if (!claims || claims.iss !== SLACK_ISSUER) return null;
	const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
	if (!audience.includes(expected.clientId)) return null;
	if (typeof claims.exp !== "number" || claims.exp * 1000 <= expected.now) return null;
	if (claims.nonce !== expected.nonce) return null;
	const user = claims["https://slack.com/user_id"] ?? claims.sub;
	return typeof user === "string" && USER_PATTERN.test(user) ? user : null;
}

/** GET /p/signin: Slack's redirect after Sign in with Slack. */
export async function finishSignIn(deps: ViewerDeps, request: Request): Promise<Response> {
	const origin = pagesOrigin(deps.env);
	if (!origin) return notFound();
	const params = new URL(request.url).searchParams;
	const [browser, storeKey, pageId] = (cookies(request).get(SIGN_IN_COOKIE) ?? "").split("~");
	const expired = () => messagePage(400, "Sign-in expired", "This sign-in has expired or was started in another browser. Open the page's link again.");
	if (!browser || !NONCE_PATTERN.test(browser) || !STORE_KEY_PATTERN.test(storeKey ?? "") || !PAGE_ID_PATTERN.test(pageId ?? "")) return expired();
	const pageLink = { href: pageUrl(origin, storeKey, pageId), label: "Open the page again" };
	const clearSignIn = { "Set-Cookie": setCookie(SIGN_IN_COOKIE, "", 0) };
	if (params.get("error")) return messagePage(403, "Not signed in", "Signing in with Slack was cancelled, so the page can't be shown.", pageLink, clearSignIn);
	const now = deps.now();
	const state = await verifySlackToken<SignInState>(deps.env, "page_signin", params.get("state"), now);
	if (!state.ok || state.payload.browser !== browser) return expired();
	const code = params.get("code") ?? "";
	if (!OAUTH_CODE_PATTERN.test(code)) return expired();

	const store = pageStoreByKey(deps.env, storeKey);
	const page = store ? await store.page(pageId, now) : null;
	if (!page) return notFound();
	let installation: Installation | null;
	try {
		installation = await loadInstallation(deps.db, page.installationId);
	} catch {
		return unavailable();
	}
	if (!installation) return notFound();
	const credentials = await appClientCredentials(deps.env, deps.db, installation).catch(() => null);
	if (!credentials) return messagePage(403, "Sign-in needed", "Signing in with Slack isn't set up for this page any more. Ask a Phaseo admin of the workspace.");

	let idToken: string | null = null;
	try {
		const response = await (deps.fetchImpl ?? fetch)(SLACK_TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, code, redirect_uri: `${origin}${SIGN_IN_PATH}` }).toString(),
			signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
		});
		const payload = await response.json().catch(() => null) as { ok?: unknown; id_token?: unknown; error?: unknown } | null;
		if (payload?.ok === true && typeof payload.id_token === "string") idToken = payload.id_token;
		else console.warn("[slack-agent] page sign-in refused by Slack", { installationId: installation.id, error: typeof payload?.error === "string" ? payload.error.slice(0, 60) : "unknown" });
	} catch {
		console.warn("[slack-agent] page sign-in: Slack unreachable", { installationId: installation.id });
	}
	const slackUserId = idToken ? signedInUser(idTokenClaims(idToken), { clientId: credentials.clientId, nonce: state.payload.oidc, now }) : null;
	if (!slackUserId) return messagePage(502, "Sign-in failed", "Slack didn't confirm the sign-in. Please try again.", pageLink, clearSignIn);

	// Membership, as the agent decides it for answers.
	const user = await lookupViewer(deps, installation, slackUserId);
	if (user === "unavailable") return messagePage(503, "Sign-in failed", "Slack couldn't confirm who you are just now. Please try again in a minute.", pageLink, clearSignIn);
	const access = viewerAccess(user, installation);
	if ("refused" in access) {
		console.log("[slack-agent] page sign-in refused", { installationId: installation.id, reason: access.refused });
		return refusedPage(access.refused, clearSignIn);
	}
	const session: Session = { installation_id: installation.id, slack_user_id: slackUserId, guest: access.guest, checked_at: now };
	const headers = new Headers({ ...COMMON_HEADERS, Location: pageLink.href });
	headers.append("Set-Cookie", await sessionCookie(deps, session, SESSION_TTL_SECONDS, now));
	headers.append("Set-Cookie", setCookie(SIGN_IN_COOKIE, "", 0));
	return new Response(null, { status: 303, headers });
}
