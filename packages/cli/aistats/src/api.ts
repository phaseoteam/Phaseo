import { readSession, writeSession, type Session } from "./session";

const DEFAULT_API_URL = "https://api.phaseo.app";
const DEFAULT_SCOPE = [
	"openid",
	"profile",
	"email",
	"workspaces:read",
	"workspaces:write",
	"keys:read",
	"keys:write",
	"keys:delete",
	"models:read",
	"providers:read",
	"pricing:read",
	"usage:read",
	"analytics:read",
	"generations:read",
	"presets:read",
	"presets:write",
	"presets:delete",
].join(" ");

export function normalizeApiRoot(input?: string): string {
	const raw = input || process.env.AI_STATS_API_URL || DEFAULT_API_URL;
	return raw.replace(/\/+$/, "").replace(/\/v1$/, "");
}

export function v1Url(apiRoot: string, path: string): string {
	return `${apiRoot}/v1${path.startsWith("/") ? path : `/${path}`}`;
}

export function oauthUrl(apiRoot: string, path: string): string {
	return `${apiRoot}/oauth${path.startsWith("/") ? path : `/${path}`}`;
}

async function parseJson(response: Response): Promise<any> {
	const text = await response.text();
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

export async function apiFetch(apiRoot: string, path: string, init: RequestInit & { accessToken?: string } = {}) {
	const headers = new Headers(init.headers);
	if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
	if (init.accessToken) headers.set("authorization", `Bearer ${init.accessToken}`);
	const response = await fetch(v1Url(apiRoot, path), { ...init, headers });
	const body = await parseJson(response);
	if (!response.ok) {
		const message = typeof body?.message === "string" ? body.message : typeof body?.error === "string" ? body.error : response.statusText;
		throw new Error(message);
	}
	return body;
}

export async function refreshSession(session: Session): Promise<Session> {
	const response = await fetch(oauthUrl(session.apiUrl, "/token"), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			grant_type: "refresh_token",
			refresh_token: session.refreshToken,
		}),
	});
	const body = await parseJson(response);
	if (!response.ok) {
		throw new Error(typeof body?.error_description === "string" ? body.error_description : "Failed to refresh AI Stats session");
	}
	const next: Session = {
		accessToken: body.access_token,
		refreshToken: body.refresh_token,
		expiresAt: Date.now() + Number(body.expires_in ?? 900) * 1000,
		apiUrl: session.apiUrl,
		scope: body.scope,
	};
	await writeSession(next);
	return next;
}

export async function getSessionAccessToken(): Promise<Session> {
	const session = await readSession();
	if (!session) throw new Error("Not logged in. Run `aistats login` first.");
	if (session.expiresAt - Date.now() < 60_000) {
		return refreshSession(session);
	}
	return session;
}

export async function startDeviceLogin(apiRoot: string) {
	const response = await fetch(oauthUrl(apiRoot, "/device/code"), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			client_id: "aistats_cli",
			scope: DEFAULT_SCOPE,
		}),
	});
	const body = await parseJson(response);
	if (!response.ok) {
		throw new Error(typeof body?.error_description === "string" ? body.error_description : "Failed to start device login");
	}
	return body as {
		device_code: string;
		user_code: string;
		verification_uri: string;
		verification_uri_complete: string;
		expires_in: number;
		interval: number;
	};
}

export async function pollDeviceToken(apiRoot: string, deviceCode: string) {
	const response = await fetch(oauthUrl(apiRoot, "/token"), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			client_id: "aistats_cli",
			device_code: deviceCode,
		}),
	});
	const body = await parseJson(response);
	if (!response.ok) {
		const code = typeof body?.error === "string" ? body.error : "token_error";
		const description = typeof body?.error_description === "string" ? body.error_description : code;
		const error = new Error(description) as Error & { code?: string };
		error.code = code;
		throw error;
	}
	return body as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
		scope?: string;
	};
}
