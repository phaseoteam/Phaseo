import { createFileRoute } from "@tanstack/react-router";
import EditOrganisationPage from "@/features/internal/data/organisations/organisationId/edit/EditOrganisationPage";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/organisations/$organisationId/edit/")({
	component: EditOrganisationPage,
});
