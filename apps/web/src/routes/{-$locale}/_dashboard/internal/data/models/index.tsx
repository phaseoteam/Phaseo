import { createFileRoute } from "@tanstack/react-router";
import ModelsPage from "@/features/internal/data/models/ModelsPage";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/models/")({
	component: ModelsPage,
});
