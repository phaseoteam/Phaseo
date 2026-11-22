import type { SourceContext } from "./types";

const USER_AGENT = "Phaseo benchmark sync (https://phaseo.app)";

class PermanentHttpError extends Error {}

async function request(url: string, init: RequestInit = {}, attempts = 3): Promise<Response> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			const response = await fetch(url, {
				...init,
				headers: { "user-agent": USER_AGENT, accept: "*/*", ...(init.headers ?? {}) },
				signal: AbortSignal.timeout(30_000),
			});
			if (response.ok) return response;
			const message = `${url} returned ${response.status}`;
			// Client errors other than rate limits won't improve on retry.
			if (response.status < 500 && response.status !== 429) throw new PermanentHttpError(message);
			lastError = new Error(message);
		} catch (error) {
			if (error instanceof PermanentHttpError) throw error;
			lastError = error;
		}
		if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt));
	}
	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export const httpContext: SourceContext = {
	async fetchText(url, init) {
		return (await request(url, init)).text();
	},
	async fetchJson(url, init) {
		return (await request(url, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) } })).json();
	},
	async fetchBytes(url, init) {
		return new Uint8Array(await (await request(url, init)).arrayBuffer());
	},
};
