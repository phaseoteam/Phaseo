// Postgres aborts one transaction of a deadlock (40P01) or a serialization conflict (40001) and rolls it
// back. Directory and role writes can meet either under concurrency (direct row writes and the entitlement
// triggers lock in different orders), and running the same transaction again then succeeds. Each Supabase
// call is one PostgREST request, which runs in one transaction, so `run` is retried as a whole.
const RETRYABLE_CODES = new Set(["40P01", "40001"]);

type DatabaseResult = { error?: { code?: string | null } | null } | null | undefined;

export async function retryTransaction<T extends DatabaseResult>(
	run: () => PromiseLike<T>,
	options: { attempts?: number; sleep?: (ms: number) => Promise<unknown>; random?: () => number } = {},
): Promise<T> {
	const attempts = options.attempts ?? 3;
	const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
	const random = options.random ?? Math.random;
	for (let attempt = 1; ; attempt += 1) {
		const result = await run();
		const code = result?.error?.code;
		if (!code || !RETRYABLE_CODES.has(code) || attempt >= attempts) return result;
		await sleep(25 * 2 ** (attempt - 1) + Math.floor(random() * 25));
	}
}
