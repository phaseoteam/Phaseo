export {};

declare global {
	interface Body {
		json<T = any>(): Promise<T>;
	}

	interface CacheStorage {
		default: Cache;
	}
}
