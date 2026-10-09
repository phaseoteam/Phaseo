// Purpose: Defer zod schema construction until first use.
// Why: Building every request schema at module load was about a third of Worker
// startup CPU; most isolates only ever parse one or two endpoints.
// How: Returns a proxy that builds the schema on first property access and forwards
// everything to it. zod 4 binds its methods to the instance, so calls through the
// proxy behave exactly like calls on the built schema.

export function lazySchema<T extends object>(build: () => T): T {
	let built: T | undefined;
	const target = (): T => (built ??= build());
	return new Proxy({} as T, {
		get: (_, key) => Reflect.get(target(), key),
		set: (_, key, value) => Reflect.set(target(), key, value),
		has: (_, key) => Reflect.has(target(), key),
		getPrototypeOf: () => Reflect.getPrototypeOf(target()),
	});
}
