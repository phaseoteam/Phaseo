// `flags/next` (Vercel Flags SDK) without Next: a flag is an async function
// that identifies the request's entities, then asks its adapter (Statsig) or
// `decide`. `dedupe` memoises per request, like the SDK does.
import { getCurrentRequest } from "@/compat/request-context";

type Entities = unknown;
type DecideArgs<E> = { entities?: E; headers: Headers; cookies: Map<string, string> };
// The flags SDK adapters (@flags-sdk/statsig) type their decide() arguments
// against the SDK's own request types; only the shape below is used here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Adapter<V, _E> = { decide(args: any): V | Promise<V> };
type FlagDeclaration<V, E> = {
	key: string;
	defaultValue?: V;
	description?: string;
	options?: unknown;
	identify?: (args: { headers: Headers; cookies: Map<string, string> }) => E | Promise<E>;
	decide?: (args: DecideArgs<E>) => V | Promise<V>;
	adapter?: Adapter<V, E>;
};

function requestBits(): { headers: Headers; cookies: Map<string, string> } {
	const request = getCurrentRequest();
	const headers = new Headers(request?.headers);
	const cookies = new Map<string, string>();
	for (const part of (headers.get("cookie") ?? "").split(/;\s*/)) {
		const eq = part.indexOf("=");
		if (eq > 0) cookies.set(part.slice(0, eq), decodeURIComponent(part.slice(eq + 1)));
	}
	return { headers, cookies };
}

export function flag<V, E = Entities>(declaration: FlagDeclaration<V, E>) {
	const evaluate = async (): Promise<V> => {
		const bits = requestBits();
		try {
			const entities = declaration.identify ? await declaration.identify(bits) : undefined;
			if (declaration.adapter) return await declaration.adapter.decide({ ...bits, entities, key: declaration.key });
			if (declaration.decide) return await declaration.decide({ ...bits, entities });
		} catch (error) {
			if (declaration.defaultValue !== undefined) return declaration.defaultValue;
			throw error;
		}
		if (declaration.defaultValue !== undefined) return declaration.defaultValue;
		throw new Error(`Flag ${declaration.key} has no decide or adapter`);
	};
	return Object.assign(evaluate, { key: declaration.key, defaultValue: declaration.defaultValue, description: declaration.description, options: declaration.options });
}

const perRequest = new WeakMap<object, Map<unknown, Promise<unknown>>>();

export function dedupe<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
	return (...args: A) => {
		const request = getCurrentRequest();
		if (!request) return fn(...args);
		let cache = perRequest.get(request);
		if (!cache) {
			cache = new Map();
			perRequest.set(request, cache);
		}
		const key = args.length ? JSON.stringify(args) : fn;
		let pending = cache.get(key) as Promise<R> | undefined;
		if (!pending) {
			pending = fn(...args);
			cache.set(key, pending);
		}
		return pending;
	};
}
