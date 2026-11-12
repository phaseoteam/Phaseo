import { createFileRoute } from "@tanstack/react-router";
import EditApiProviderPage from "@/features/internal/data/api-providers/providerId/edit/EditApiProviderPage";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/api-providers/$providerId/edit/")({
	component: EditApiProviderPage,
});
