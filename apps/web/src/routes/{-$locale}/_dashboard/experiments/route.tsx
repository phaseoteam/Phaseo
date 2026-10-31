import { createFileRoute } from "@tanstack/react-router";
import ExperimentsLayout from "@/features/experiments/ExperimentsLayout";

export const Route = createFileRoute("/{-$locale}/_dashboard/experiments")({
	component: ExperimentsLayout,
});
