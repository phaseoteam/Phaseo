import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import NewGuardrailPage, { getNewGuardrailMetadata } from "@/features/settings/guardrails/new/NewGuardrailPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getNewGuardrailMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/guardrails/new/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: NewGuardrailPage,
});
