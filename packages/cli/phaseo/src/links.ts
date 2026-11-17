/** Web pages that CLI output links to. PHASEO_WEB_URL points them at another deployment. */

export const DEFAULT_WEB_URL = "https://phaseo.app";

export function webBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
	return (env.PHASEO_WEB_URL || DEFAULT_WEB_URL).replace(/\/+$/, "");
}

function path(...segments: string[]): string {
	return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

/** Catalogue page for a model id such as "openai/gpt-6-luna". */
export function modelPageUrl(modelId: unknown, env?: NodeJS.ProcessEnv): string | undefined {
	if (typeof modelId !== "string") return undefined;
	const [organisation, ...rest] = modelId.split("/");
	if (!organisation || !rest.length || rest.some((part) => !part)) return undefined;
	return `${webBaseUrl(env)}/models/${path(organisation, rest.join("/"))}`;
}

/** Provider page for a provider id such as "openai" or "alibaba-cloud". */
export function providerPageUrl(providerId: unknown, env?: NodeJS.ProcessEnv): string | undefined {
	if (typeof providerId !== "string" || !providerId) return undefined;
	return `${webBaseUrl(env)}/api-providers/${path(providerId)}`;
}

/** Dashboard page for one request in the logs. */
export function requestPageUrl(requestId: unknown, workspaceId?: string, env?: NodeJS.ProcessEnv): string | undefined {
	if (typeof requestId !== "string" || !requestId) return undefined;
	const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
	return `${webBaseUrl(env)}/settings/usage/logs/requests/${path(requestId)}${query}`;
}

/** Dashboard page listing API keys. There is no page for a single key. */
export function keysPageUrl(env?: NodeJS.ProcessEnv): string {
	return `${webBaseUrl(env)}/settings/keys`;
}
