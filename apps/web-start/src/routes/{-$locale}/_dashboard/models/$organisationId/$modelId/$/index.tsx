// Next: src/app/[locale]/(dashboard)/models/[organisationId]/[modelId]/[...legacyPath]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/models/[organisationId]/[modelId]/[...legacyPath]/page";


export const Route = createFileRoute("/{-$locale}/_dashboard/models/$organisationId/$modelId/$/")({
	component: nextPageComponent(Page, { splatName: "legacyPath" }),
});
