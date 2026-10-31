import { createFileRoute } from "@tanstack/react-router";
import OrganisationsPage from "@/features/internal/data/organisations/OrganisationsPage";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/organisations/")({
	component: OrganisationsPage,
});
