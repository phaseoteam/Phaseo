import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/workspaces/")({
	beforeLoad: redirectBeforeLoad("temporary", () => "/settings/workspaces/settings"),
});
