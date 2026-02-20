import { createBrowserClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const DEFAULT_FETCH_RETRIES = Number(process.env.SUPABASE_FETCH_RETRIES ?? '3')
const DEFAULT_FETCH_TIMEOUT_MS = Number(process.env.SUPABASE_FETCH_TIMEOUT_MS ?? '20000')

function toErrorCode(err: unknown): string | null {
	const value = err as { code?: unknown; cause?: { code?: unknown } }
	if (typeof value?.code === 'string') return value.code
	if (typeof value?.cause?.code === 'string') return value.cause.code
	return null
}

function toErrorName(err: unknown): string | null {
	const value = err as { name?: unknown; cause?: { name?: unknown } }
	if (typeof value?.name === 'string') return value.name
	if (typeof value?.cause?.name === 'string') return value.cause.name
	return null
}

function isRetryableFetchError(err: unknown): boolean {
	const message = err instanceof Error ? err.message.toLowerCase() : String(err ?? '').toLowerCase()
	const code = (toErrorCode(err) ?? '').toUpperCase()
	const name = (toErrorName(err) ?? '').toUpperCase()
	if (message.includes('fetch failed')) return true
	if (message.includes('network') || message.includes('timeout') || message.includes('timed out')) return true
	if (message.includes('this operation was aborted') || message.includes('was aborted')) return true
	if (message.includes('aborterror')) return true
	if (name === 'ABORTERROR' || code === 'ABORT_ERR') return true
	if (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(code)) return true
	return false
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const attempts = Number.isFinite(DEFAULT_FETCH_RETRIES) ? Math.max(0, DEFAULT_FETCH_RETRIES) : 3
	const timeoutMs = Number.isFinite(DEFAULT_FETCH_TIMEOUT_MS)
		? Math.max(1000, DEFAULT_FETCH_TIMEOUT_MS)
		: 20000
	let lastError: unknown = null

	for (let attempt = 0; attempt <= attempts; attempt += 1) {
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), timeoutMs)

		try {
			const signal = init?.signal
				? AbortSignal.any([init.signal, controller.signal])
				: controller.signal
			const response = await fetch(input, {
				...init,
				signal,
			})
			clearTimeout(timeout)
			return response
		} catch (err) {
			clearTimeout(timeout)
			lastError = err
			// Respect caller-provided cancellation and avoid retries for explicit aborts.
			if (init?.signal?.aborted) {
				throw err
			}
			if (!isRetryableFetchError(err) || attempt >= attempts) {
				throw err
			}
			const backoffMs = Math.min(1500, 200 * (attempt + 1))
			await sleep(backoffMs)
		}
	}

	throw lastError instanceof Error
		? lastError
		: new Error('Supabase fetch failed after retries')
}

export function createClient() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL
	const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
	if (!url) {
		throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL for Supabase client')
	}
	if (!anonKey) {
		throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY for Supabase client')
	}

	// Many server fetchers import this helper; avoid browser-only client initialization on the server.
	if (typeof window === 'undefined') {
		return createSupabaseClient(url, anonKey, {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch: fetchWithRetry },
		})
	}

	return createBrowserClient(url, anonKey)
}
