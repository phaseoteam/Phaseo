import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi } from "@/lib/web-api/client";

const inFlight = new Map<string, Promise<any>>();

function coalesced<T>(key: string, load: () => Promise<T>): Promise<T> {
	const existing = inFlight.get(key) as Promise<T> | undefined;
	if (existing) return existing;
	const promise = load().finally(() => inFlight.delete(key));
	inFlight.set(key, promise);
	return promise;
}

export function fetchAdminModelEditorSource(modelId: string) {
	const path = `/api/account/models/${encodeURIComponent(modelId)}/source` as const;
	return coalesced(path, async () => {
		const response = await fetchAccountWebApi<{ source: Record<string, any> }>(path, await getBrowserAccessToken());
		return response.source;
	});
}

export function fetchAdminModelFormOptions() {
	const path = "/api/account/models/catalog/model-form-options" as const;
	return coalesced(path, async () => fetchAccountWebApi<Record<string, any>>(path, await getBrowserAccessToken()));
}

export async function createAdminBenchmark(input: { id: string; name: string }) {
	return fetchAccountWebApi<{ benchmark: { id: string; name: string } }>(
		"/api/account/models/catalog/benchmarks",
		await getBrowserAccessToken(),
		{ method: "POST", body: JSON.stringify(input) },
	);
}

export async function createAdminSubscriptionPlan(input: Record<string, unknown>) {
	return fetchAccountWebApi<{ plan: Record<string, unknown> }>(
		"/api/account/models/catalog/subscription-plans",
		await getBrowserAccessToken(),
		{ method: "POST", body: JSON.stringify(input) },
	);
}
