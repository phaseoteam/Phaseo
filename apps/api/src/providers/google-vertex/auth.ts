type VertexServiceAccount = {
	client_email: string;
	private_key: string;
	token_uri?: string;
};

function vertexError(code: string): Error & { code: string } {
	const error = new Error(code) as Error & { code: string };
	error.code = code;
	return error;
}

export function resolveVertexApiBase(bindings: Record<string, unknown>): string {
	const rawBase = String(bindings.GOOGLE_VERTEX_BASE_URL || "").replace(/\/+$/, "");
	const project = String(bindings.GOOGLE_VERTEX_PROJECT || "").trim();
	const location = String(bindings.GOOGLE_VERTEX_LOCATION || "").trim() || "global";

	if (rawBase) {
		if (/\/v\d+(?:beta\d+)?\/projects\/[^/]+\/locations\/[^/]+$/i.test(rawBase)) {
			return rawBase;
		}
		if (!project) throw vertexError("google-vertex_project_missing");
		if (/\/v\d+(?:beta\d+)?$/i.test(rawBase)) {
			return `${rawBase}/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}`;
		}
		return `${rawBase}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}`;
	}

	if (!project) throw vertexError("google-vertex_project_missing");
	const host = location.toLowerCase() === "global"
		? "aiplatform.googleapis.com"
		: `${encodeURIComponent(location)}-aiplatform.googleapis.com`;
	return `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}`;
}

export async function resolveVertexAccessToken(rawKey: string): Promise<string> {
	const value = rawKey.trim();
	if (!value) throw vertexError("google-vertex_access_token_missing");

	if (value.startsWith("{")) {
		try {
			const parsed = JSON.parse(value) as Record<string, unknown>;
			if (isVertexServiceAccount(parsed)) {
				return mintServiceAccountAccessToken(parsed);
			}
			const token = typeof parsed.access_token === "string" ? parsed.access_token.trim() : "";
			if (token) return token;
		} catch {
			// Continue with plain token handling.
		}
	}

	if (value.startsWith("Bearer ")) {
		return value.slice("Bearer ".length).trim();
	}
	return value;
}

export function resolveGoogleCloudStorageMediaUrl(rawUri: string): string | null {
	const trimmed = rawUri.trim();
	if (!trimmed) return null;
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	if (!trimmed.startsWith("gs://")) return null;
	const withoutScheme = trimmed.slice("gs://".length);
	const firstSlash = withoutScheme.indexOf("/");
	if (firstSlash < 1 || firstSlash === withoutScheme.length - 1) return null;
	const bucket = withoutScheme.slice(0, firstSlash);
	const objectPath = withoutScheme.slice(firstSlash + 1);
	return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}?alt=media`;
}

function isVertexServiceAccount(payload: Record<string, unknown>): payload is VertexServiceAccount {
	return (
		typeof payload.client_email === "string" &&
		typeof payload.private_key === "string"
	);
}

async function mintServiceAccountAccessToken(sa: VertexServiceAccount): Promise<string> {
	const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
	const now = Math.floor(Date.now() / 1000);
	const header = { alg: "RS256", typ: "JWT" };
	const claimSet = {
		iss: sa.client_email,
		sub: sa.client_email,
		aud: tokenUri,
		scope: "https://www.googleapis.com/auth/cloud-platform",
		iat: now,
		exp: now + 3600,
	};

	const encodedHeader = base64UrlEncodeUtf8(JSON.stringify(header));
	const encodedClaims = base64UrlEncodeUtf8(JSON.stringify(claimSet));
	const unsignedJwt = `${encodedHeader}.${encodedClaims}`;
	const signature = await signJwtRs256(unsignedJwt, sa.private_key);
	const assertion = `${unsignedJwt}.${signature}`;

	const body = new URLSearchParams({
		grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
		assertion,
	});

	const res = await fetch(tokenUri, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body,
	});

	if (!res.ok) {
		throw vertexError(`google-vertex_oauth_error_${res.status}`);
	}
	const json = await res.json() as { access_token?: string };
	if (!json?.access_token) {
		throw vertexError("google-vertex_oauth_access_token_missing");
	}
	return json.access_token;
}

async function signJwtRs256(unsignedJwt: string, privateKeyPem: string): Promise<string> {
	const pem = privateKeyPem.replace(/\\n/g, "\n");
	const keyData = pemToArrayBuffer(pem);
	const key = await crypto.subtle.importKey(
		"pkcs8",
		keyData,
		{
			name: "RSASSA-PKCS1-v1_5",
			hash: "SHA-256",
		},
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"RSASSA-PKCS1-v1_5",
		key,
		new TextEncoder().encode(unsignedJwt),
	);
	return base64UrlEncodeBytes(new Uint8Array(signature));
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
	const base64 = pem
		.replace(/-----BEGIN PRIVATE KEY-----/g, "")
		.replace(/-----END PRIVATE KEY-----/g, "")
		.replace(/\s+/g, "");
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

function base64UrlEncodeUtf8(value: string): string {
	return base64UrlFromBase64(btoa(value));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 1) {
		binary += String.fromCharCode(bytes[i]);
	}
	return base64UrlFromBase64(btoa(binary));
}

function base64UrlFromBase64(value: string): string {
	return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
