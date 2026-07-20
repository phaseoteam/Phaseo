// Offline maintenance scripts and the server-side post-login bootstrap. Other
// application runtime data access should use apps/web-api.
import { createClient } from "@supabase/supabase-js";

const DEFAULT_FETCH_RETRIES = Number(process.env.SUPABASE_FETCH_RETRIES ?? "3");
const DEFAULT_FETCH_TIMEOUT_MS = Number(process.env.SUPABASE_FETCH_TIMEOUT_MS ?? "20000");

function errorCode(error: unknown): string {
	const value = error as { code?: unknown; cause?: { code?: unknown } };
	return typeof value?.code === "string" ? value.code : typeof value?.cause?.code === "string" ? value.cause.code : "";
}

function retryable(error: unknown): boolean {
	const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
	return message.includes("fetch failed") || message.includes("network") || message.includes("timeout") || ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"].includes(errorCode(error).toUpperCase());
}

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const attempts = Number.isFinite(DEFAULT_FETCH_RETRIES) ? Math.max(0, DEFAULT_FETCH_RETRIES) : 3;
	const timeoutMs = Number.isFinite(DEFAULT_FETCH_TIMEOUT_MS) ? Math.max(1000, DEFAULT_FETCH_TIMEOUT_MS) : 20000;
	let lastError: unknown;
	for (let attempt = 0; attempt <= attempts; attempt += 1) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const signal = init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
			return await fetch(input, { ...init, signal });
		} catch (error) {
			lastError = error;
			if (!retryable(error) || attempt >= attempts) throw error;
			await new Promise((resolve) => setTimeout(resolve, Math.min(1500, 200 * (attempt + 1))));
		} finally {
			clearTimeout(timeout);
		}
	}
	throw lastError instanceof Error ? lastError : new Error("Supabase fetch failed after retries");
}

export function createAdminClient() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) throw new Error("Missing Supabase configuration for maintenance script");
	return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchWithRetry } });
}
