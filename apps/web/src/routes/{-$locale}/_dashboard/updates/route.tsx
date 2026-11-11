import { createFileRoute } from "@tanstack/react-router";
import UpdatesLayout from "@/features/updates/UpdatesLayout";

export const Route = createFileRoute("/{-$locale}/_dashboard/updates")({
	component: UpdatesLayout,
});
