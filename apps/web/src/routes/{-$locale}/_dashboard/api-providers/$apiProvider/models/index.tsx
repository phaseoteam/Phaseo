import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/_dashboard/api-providers/$apiProvider/models/")({
	beforeLoad: redirectBeforeLoad("temporary", ({ params }) => `/api-providers/${encodeURIComponent(params.apiProvider ?? "")}#models`),
});
