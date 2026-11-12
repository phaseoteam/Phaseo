import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import GuardrailsPage, { getGuardrailsMetadata } from "@/features/settings/guardrails/GuardrailsPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getGuardrailsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/guardrails/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: GuardrailsPage,
});
