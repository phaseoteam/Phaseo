import { createFileRoute } from "@tanstack/react-router";
import DataPage from "@/features/internal/data/DataPage";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/")({
	component: DataPage,
});
