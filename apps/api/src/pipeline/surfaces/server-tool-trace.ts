/** Bound retained audit data independently of the full tool response sent to callers. */
export function createToolTraceRetention() {
	let remaining = 64 * 1024;
	let nodes = 2000;
	function retain(value: unknown, depth = 0): unknown {
		if (remaining <= 0 || nodes-- <= 0 || depth > 8) return "[truncated]";
		if (typeof value === "string") {
			if (value.startsWith("data:")) return "[binary omitted]";
			const length = Math.min(value.length, remaining, 8192);
			remaining -= length;
			return value.length > length ? value.slice(0, length) + "[truncated]" : value;
		}
		if (Array.isArray(value)) return value.slice(0, 100).map((item) => retain(item, depth + 1));
		if (value && typeof value === "object") {
			const result: Record<string, unknown> = Object.create(null);
			let count = 0;
			for (const key in value) {
				if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
				if (count++ >= 100 || remaining <= 0 || nodes <= 0) break;
				const retainedKey = key.slice(0, 128);
				remaining -= retainedKey.length;
				result[retainedKey] = /^(b64_json|base64|data)$/i.test(key)
					? "[binary omitted]"
					: retain((value as Record<string, unknown>)[key], depth + 1);
			}
			return result;
		}
		return value;
	}
	return retain;
}
