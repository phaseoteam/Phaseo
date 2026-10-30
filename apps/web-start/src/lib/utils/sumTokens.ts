export function sumTokens(payload: any): number {
	if (payload == null) return 0;

	if (typeof payload === "number") {
		return Number.isFinite(payload) ? payload : 0;
	}

	if (Array.isArray(payload)) {
		return payload.reduce((total, item) => total + sumTokens(item), 0);
	}

	if (typeof payload === "object") {
		return Object.entries(payload).reduce((total, [key, value]) => {
			if (typeof value === "number") {
				return /token/i.test(key)
					? total + (Number.isFinite(value) ? value : 0)
					: total;
			}
			return total + sumTokens(value);
		}, 0);
	}

	return 0;
}
