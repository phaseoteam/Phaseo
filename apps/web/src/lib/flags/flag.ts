// Server-side feature flags: a flag is an async function that decides its
// value for the current request. `dedupe` memoises a function per request.
import { getCurrentRequest } from "@/compat/request-context";

export type FlagDeclaration<V> = {
	key: string;
	decide: () => V | Promise<V>;
};

export type Flag<V> = (() => Promise<V>) & { key: string };

export function flag<V>(declaration: FlagDeclaration<V>): Flag<V> {
	const evaluate = async (): Promise<V> => declaration.decide();
	return Object.assign(evaluate, { key: declaration.key });
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
