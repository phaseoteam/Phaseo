import { createFileRoute } from "@tanstack/react-router";
import EditModelPage from "@/features/internal/data/models/edit/modelId/EditModelPage";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/models/edit/$")({
	component: EditModelPage,
});
