import { usageSearchParams, type UsageSearchParams } from "@/lib/query/privateUsage";

/** Where /settings/usage/logs redirects to (unlocalised; the route adds the locale). */
export function usageLogsRedirectHref(sp: UsageSearchParams): string {
	const raw = (Array.isArray(sp.view) ? sp.view[0] : sp.view)?.toLowerCase();
	const segment = ["upstream", "jobs", "sessions"].includes(raw ?? "") ? raw : "requests";
	const params = usageSearchParams(sp);
	params.delete("view");
	return `/settings/usage/logs/${segment}${params.size ? `?${params}` : ""}`;
}
