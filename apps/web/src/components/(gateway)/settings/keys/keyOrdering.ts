export type KeyState = "active" | "disabled" | "limited" | "expired";

export function getKeyState(k: any): KeyState {
	const expiresRaw = typeof k?.expires_at === "string" ? k.expires_at : "";
	if (expiresRaw) {
		const expiresAtMs = Date.parse(expiresRaw);
		if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
			return "expired";
		}
	}

	const status = String(k?.status ?? "").toLowerCase();
	const isDisabled = status === "paused" || status === "disabled" || status === "revoked";
	if (isDisabled) return "disabled";

	const limits = [
		[Number(k?.current_usage_daily ?? 0) || 0, Number(k?.daily_limit_requests ?? 0) || 0],
		[Number(k?.current_usage_weekly ?? 0) || 0, Number(k?.weekly_limit_requests ?? 0) || 0],
		[Number(k?.current_usage_monthly ?? 0) || 0, Number(k?.monthly_limit_requests ?? 0) || 0],
		[Number(k?.current_usage_daily_cost_nanos ?? 0) || 0, Number(k?.daily_limit_cost_nanos ?? 0) || 0],
		[Number(k?.current_usage_weekly_cost_nanos ?? 0) || 0, Number(k?.weekly_limit_cost_nanos ?? 0) || 0],
		[Number(k?.current_usage_monthly_cost_nanos ?? 0) || 0, Number(k?.monthly_limit_cost_nanos ?? 0) || 0],
	] as const;
	const hasReachedLimit = limits.some(([used, limit]) => limit > 0 && used >= limit);
	if (hasReachedLimit) return "limited";

	return "active";
}


export function organiseKeys(keys: any[], filter: string) {
	return keys
		.map((key: any, index: number) => ({ key, index }))
		.sort((a: { key: any; index: number }, b: { key: any; index: number }) => {
			const rank = { active: 0, limited: 0, disabled: 1, expired: 2 };
			const statusOrder = rank[getKeyState(a.key)] - rank[getKeyState(b.key)];
			if (statusOrder) return statusOrder;
			const aTime = typeof a.key?.last_used_at === "string"
				? Date.parse(a.key.last_used_at)
				: Number.NaN;
			const bTime = typeof b.key?.last_used_at === "string"
				? Date.parse(b.key.last_used_at)
				: Number.NaN;
			const aValid = Number.isFinite(aTime);
			const bValid = Number.isFinite(bTime);
			if (aValid && bValid && aTime !== bTime) return bTime - aTime;
			if (aValid !== bValid) return aValid ? -1 : 1;
			return a.index - b.index;
		})
		.map(({ key }: { key: any }) => key)
		.filter((key: any) => {
			const state = getKeyState(key);
			return filter === "all" || filter.split("-").includes(state === "active" || state === "limited" ? "enabled" : state);
		});
}
