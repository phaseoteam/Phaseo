// Per-isolate cache for values loaded with I/O. On Workers a request must not
// await I/O that another request started (it can hang until the client gives
// up), so only settled values are shared; concurrent first loads each do
// their own I/O and the first to finish fills the cache.
export function settledCache<K, V>(load: (key: K) => Promise<V>): (key: K) => Promise<V> {
	const values = new Map<K, V>();
	return async (key) => {
		if (values.has(key)) return values.get(key) as V;
		const value = await load(key);
		if (!values.has(key)) values.set(key, value);
		return values.get(key) as V;
	};
}
