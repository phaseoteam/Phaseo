import { createFileRoute } from "@tanstack/react-router";
import NewModelPage from "@/features/internal/data/models/new/NewModelPage";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/models/new/")({
	component: NewModelPage,
});
