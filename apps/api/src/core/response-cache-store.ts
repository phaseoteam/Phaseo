// Purpose: Upstash Redis storage for the response cache.
// Why: Workers need a shared store reachable over HTTP with per-entry TTLs.
// How: Calls the Upstash REST API with one command per request. Reads have a
//      short deadline so a slow store costs a miss, never a slow response.
//      Each deployment points at the database nearest to where it runs.
import { MAX_RESPONSE_CACHE_RECORD_BYTES, type ResponseCacheStore } from "@core/response-cache";

const READ_TIMEOUT_MS = 300;
const WRITE_TIMEOUT_MS = 2_000;

export type UpstashResponseCacheConfig = {
	url: string;
	token: string;
	readTimeoutMs?: number;
	writeTimeoutMs?: number;
	maxRecordBytes?: number;
	fetchImpl?: typeof fetch;
};

type UpstashReply = { result?: unknown; error?: string };

export function createUpstashResponseCacheStore(config: UpstashResponseCacheConfig): ResponseCacheStore {
	const endpoint = config.url.replace(/\/+$/, "");
	const fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));
	const maxRecordBytes = config.maxRecordBytes ?? MAX_RESPONSE_CACHE_RECORD_BYTES;

	async function command(args: Array<string | number>, timeoutMs: number): Promise<unknown> {
		const response = await fetchImpl(endpoint, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(args),
			signal: AbortSignal.timeout(timeoutMs),
		});
		const reply = (await response.json().catch(() => null)) as UpstashReply | null;
		if (!response.ok || !reply || reply.error) {
			// The reply never echoes the token, but keep only its error text.
			throw new Error(`upstash_${args[0]}_failed: ${response.status} ${reply?.error ?? ""}`.trim());
		}
		return reply.result ?? null;
	}

	return {
		kind: "upstash",
		async get<T>(key: string): Promise<T | null> {
			const result = await command(["GET", key], config.readTimeoutMs ?? READ_TIMEOUT_MS);
			if (typeof result !== "string") return null;
			try {
				return JSON.parse(result) as T;
			} catch {
				return null;
			}
		},
		async set<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
			const serialized = JSON.stringify(value);
			if (new TextEncoder().encode(serialized).byteLength > maxRecordBytes) return false;
			await command(["SET", key, serialized, "EX", Math.max(1, Math.floor(ttlSeconds))], config.writeTimeoutMs ?? WRITE_TIMEOUT_MS);
			return true;
		},
		async delete(key: string): Promise<void> {
			await command(["DEL", key], config.writeTimeoutMs ?? WRITE_TIMEOUT_MS);
		},
	};
}
