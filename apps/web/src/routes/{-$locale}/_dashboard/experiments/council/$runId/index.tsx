import { createFileRoute } from "@tanstack/react-router";
import CouncilRunPage from "@/features/experiments/council/runId/CouncilRunPage";

export const Route = createFileRoute("/{-$locale}/_dashboard/experiments/council/$runId/")({
	component: CouncilRunPage,
});
