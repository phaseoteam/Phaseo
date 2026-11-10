import { usageSearchParams, type UsageSearchParams } from "@/lib/query/privateUsage";

/** Where /settings/usage permanently redirects to (unlocalised; the route adds the locale). */
export function usageRedirectHref(searchParams: UsageSearchParams): string {
	const params = usageSearchParams(searchParams);
	const tab = (params.get("tab") ?? "").toLowerCase();
	const target = `/settings/usage/${["trends", "explore", "guardrails"].includes(tab) ? tab : "overview"}`;
	params.delete("tab");
	return params.size ? `${target}?${params}` : target;
}
