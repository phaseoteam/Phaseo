import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad, searchString } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/_dashboard/gateway/usage/")({
	beforeLoad: redirectBeforeLoad("permanent", ({ search }) => {
		const query = new URLSearchParams();
		for (const [key, value] of Object.entries(search)) {
			if (key === "tab") continue;
			if (Array.isArray(value)) value.forEach((item) => query.append(key, String(item)));
			else if (typeof value === "string") query.append(key, value);
		}
		const tab = (searchString(search, "tab") ?? "").toLowerCase();
		const target = tab === "trends" || tab === "explore" || tab === "guardrails" ? `/settings/usage/${tab}` : "/settings/usage/overview";
		const qs = query.toString();
		return qs ? `${target}?${qs}` : target;
	}),
});
