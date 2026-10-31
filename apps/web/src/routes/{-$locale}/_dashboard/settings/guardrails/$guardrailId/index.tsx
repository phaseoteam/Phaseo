import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import GuardrailPage, { getGuardrailMetadata } from "@/features/settings/guardrails/guardrailId/GuardrailPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getGuardrailMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/guardrails/$guardrailId/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: GuardrailPage,
});
