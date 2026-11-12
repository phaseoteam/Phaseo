import { createFileRoute } from "@tanstack/react-router";
import ApiProvidersPage from "@/features/internal/data/api-providers/ApiProvidersPage";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/api-providers/")({
	component: ApiProvidersPage,
});
