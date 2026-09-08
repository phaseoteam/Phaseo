const PRIVATE_MODEL_ID = /^[a-z0-9][a-z0-9._-]{0,62}\/[a-z0-9][a-z0-9._:-]{0,126}$/;
const PRIVATE_MODEL_SLUG = /^[a-z0-9][a-z0-9._:-]{0,126}$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export function normalizePrivateModelId(value: unknown): string {
	const raw = String(value ?? "").trim().toLowerCase();
	if (!PRIVATE_MODEL_ID.test(raw)) {
		throw new Error("model_id must use owner/model with lowercase letters, numbers, dots, dashes, underscores, or a model variant suffix");
	}
	return raw;
}

export function buildPrivateModelId(workspaceId: string, value: unknown): string {
	const slug = String(value ?? "").trim().toLowerCase();
	const namespace = String(workspaceId ?? "").trim().toLowerCase();
	if (!PRIVATE_MODEL_SLUG.test(slug)) {
		throw new Error("slug must contain only lowercase letters, numbers, dots, dashes, underscores, or a variant suffix");
	}
	return normalizePrivateModelId(`${namespace}/${slug}`);
}

export function normalizePrivateModelBaseUrl(value: unknown): string {
	let url: URL;
	try {
		url = new URL(String(value ?? "").trim());
	} catch {
		throw new Error("base_url must be a valid HTTPS URL");
	}
	const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
	if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
		throw new Error("base_url must be an HTTPS origin or path without credentials, query parameters, or fragments");
	}
	if (url.port && url.port !== "443") throw new Error("base_url must use the standard HTTPS port");
	if (
		!hostname.includes(".") ||
		IPV4.test(hostname) ||
		hostname.includes(":") ||
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		hostname.endsWith(".local") ||
		hostname.endsWith(".internal") ||
		hostname === "metadata.google.internal"
	) {
		throw new Error("base_url must use a public DNS hostname");
	}
	if (/\/(?:chat\/completions|responses)\/?$/i.test(url.pathname)) {
		throw new Error("base_url must stop before /chat/completions or /responses");
	}
	return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function normalizePrivateModelSecret(value: unknown): string {
	const secret = String(value ?? "").trim();
	if (secret.length < 8) throw new Error("credential must contain at least 8 characters");
	if (/\s/.test(secret)) throw new Error("credential must not contain spaces or line breaks");
	return secret;
}

export function normalizePositiveInteger(value: unknown, field: string): number | null {
	if (value === null || value === undefined || value === "") return null;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${field} must be a positive integer`);
	return parsed;
}
