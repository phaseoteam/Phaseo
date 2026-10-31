import { createFileRoute } from "@tanstack/react-router";
import RegistriesPage from "@/features/internal/data/registries/RegistriesPage";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/registries/")({
	component: RegistriesPage,
});
