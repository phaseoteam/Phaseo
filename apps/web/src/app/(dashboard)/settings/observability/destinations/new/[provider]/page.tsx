import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import BroadcastDestinationCreateClient from "@/components/(gateway)/settings/observability/BroadcastDestinationCreateClient";
import { getDestinationById } from "@/components/(gateway)/settings/observability/destinationCatalog";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ provider: string }>;
}) {
	const { provider } = await params;
	const destination = getDestinationById(provider);
	return {
		title: destination
			? `New ${destination.label} Destination - Broadcast`
			: "New Destination - Broadcast",
	};
}

export default async function NewBroadcastDestinationPage({
	params,
}: {
	params: Promise<{ provider: string }>;
}) {
	const { provider } = await params;
	const destination = getDestinationById(provider);
	if (!destination) notFound();

	const supabase = await createClient();
	const teamId = await getTeamIdFromCookie();

	if (!teamId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Select a team to add a destination.
			</div>
		);
	}

	const [teamResult, keysResult, providersResult, activeProviderModelsResult] = await Promise.all([
		supabase.from("teams").select("id, name").eq("id", teamId).maybeSingle(),
		supabase
			.from("keys")
			.select("id, name, prefix")
			.eq("team_id", teamId)
			.order("created_at", { ascending: false }),
		supabase
			.from("data_api_providers")
			.select("api_provider_id, api_provider_name")
			.order("api_provider_name", { ascending: true }),
		supabase
			.from("data_api_provider_models")
			.select(
				"provider_id, api_model_id, is_active_gateway, model:data_models!data_api_provider_models_internal_model_id_fkey(model_id, name, organisation_id)",
			)
			.eq("is_active_gateway", true),
	]);

	if (teamResult.error) throw new Error(teamResult.error.message);
	if (keysResult.error) throw new Error(keysResult.error.message);
	if (providersResult.error) throw new Error(providersResult.error.message);
	if (activeProviderModelsResult.error) {
		throw new Error(activeProviderModelsResult.error.message);
	}

	const providerOptions = (providersResult.data ?? []).map((p: any) => {
		const providerId = p.api_provider_id as string;
		return {
			value: providerId,
			label: (p.api_provider_name as string) ?? providerId,
			logoId: providerId,
		};
	});

	const modelOptionById = new Map<
		string,
		{ value: string; label: string; logoId: string | null; subtitle: string | null }
	>();
	for (const row of activeProviderModelsResult.data ?? []) {
		const modelId = (row as any).api_model_id as string | null;
		if (!modelId) continue;
		const modelRow = Array.isArray((row as any).model)
			? (row as any).model[0]
			: (row as any).model;
		const modelName = (modelRow?.name as string | null) ?? modelId;
		const organisationId = (modelRow?.organisation_id as string | null) ?? null;
		const subtitle = modelName === modelId ? null : modelId;
		const existing = modelOptionById.get(modelId);
		if (!existing || existing.label === modelId) {
			modelOptionById.set(modelId, {
				value: modelId,
				label: modelName,
				logoId: organisationId,
				subtitle,
			});
		}
	}
	const modelOptions = Array.from(modelOptionById.values()).sort((a, b) =>
		a.label.localeCompare(b.label),
	);

	return (
		<main className="space-y-6">
			<BroadcastDestinationCreateClient
				destination={destination}
				teamName={teamResult.data?.name ?? null}
				providerOptions={providerOptions}
				modelOptions={modelOptions}
				keys={(keysResult.data ?? []).map((k: any) => ({
					id: k.id as string,
					name: (k.name as string | null) ?? null,
					prefix: (k.prefix as string | null) ?? null,
				}))}
			/>
		</main>
	);
}
