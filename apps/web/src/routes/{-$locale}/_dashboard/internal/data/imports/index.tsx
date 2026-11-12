import { createFileRoute } from "@tanstack/react-router";
import ImportsPage from "@/features/internal/data/imports/ImportsPage";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/imports/")({
	component: ImportsPage,
});
