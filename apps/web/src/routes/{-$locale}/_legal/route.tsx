// Privacy and terms: a slim header with a back button instead of the site header.
import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/features/legal/LegalLayout";

export const Route = createFileRoute("/{-$locale}/_legal")({
	component: LegalLayout,
});
