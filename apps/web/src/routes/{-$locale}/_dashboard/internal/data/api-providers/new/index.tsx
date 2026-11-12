import { createFileRoute } from "@tanstack/react-router";
import NewApiProviderPage from "@/features/internal/data/api-providers/new/NewApiProviderPage";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/api-providers/new/")({
	component: NewApiProviderPage,
});
