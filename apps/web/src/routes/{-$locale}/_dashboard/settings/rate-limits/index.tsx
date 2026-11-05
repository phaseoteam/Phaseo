import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import RateLimitsPage, { getRateLimitsMetadata } from "@/features/settings/rate-limits/RateLimitsPage";
import { redirect } from "@/i18n/navigation";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getRateLimitsMetadata()));

// Rate limits are rate guardrails now, set up and assigned under Settings, Guardrails.
export const Route = createFileRoute("/{-$locale}/_dashboard/settings/rate-limits/")({
	beforeLoad: ({ params }) => {
		redirect({ href: "/settings/guardrails", locale: params.locale ?? "en-GB" });
	},
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: RateLimitsPage,
});
