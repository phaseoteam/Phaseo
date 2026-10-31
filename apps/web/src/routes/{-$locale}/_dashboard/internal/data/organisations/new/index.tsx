import { createFileRoute } from "@tanstack/react-router";
import NewOrganisationPage from "@/features/internal/data/organisations/new/NewOrganisationPage";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/organisations/new/")({
	component: NewOrganisationPage,
});
