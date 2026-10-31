import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/_dashboard/api-providers/$apiProvider/embeddings-models/")({
	beforeLoad: redirectBeforeLoad("temporary", ({ params }) => `/api-providers/${params.apiProvider}/models`),
});
