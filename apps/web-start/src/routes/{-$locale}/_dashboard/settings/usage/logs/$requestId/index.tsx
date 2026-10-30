// Next: src/app/[locale]/(dashboard)/settings/usage/logs/[requestId]/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/usage/logs/$requestId/")({
	beforeLoad: redirectBeforeLoad("temporary", ({ params, search }) => {
		const query = new URLSearchParams();
		for (const [key, value] of Object.entries(search)) {
			if (Array.isArray(value)) value.forEach((item) => query.append(key, String(item)));
			else if (typeof value === "string") query.set(key, value);
		}
		return `/settings/usage/logs/requests/${encodeURIComponent(decodeURIComponent(params.requestId ?? ""))}${query.size ? `?${query.toString()}` : ""}`;
	}),
});
