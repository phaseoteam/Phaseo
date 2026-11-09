import { createFileRoute } from "@tanstack/react-router";
import ModelsLayout from "@/features/models/ModelsLayout";

export const Route = createFileRoute("/{-$locale}/_dashboard/models")({
	component: ModelsLayout,
});
