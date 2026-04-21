import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import { CHAT_MANAGED_KEY_NAME } from "@/lib/gateway/managed-chat-key";
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
	const workspaceId = await getWorkspaceIdFromCookie();

	if (!workspaceId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Select a workspace to add a destination.
			</div>
		);
	}

	const [teamResult, keysResult, providersResult, activeProviderModelsResult] = await Promise.all([
		supabase.from("workspaces").select("id, name").eq("id", workspaceId).maybeSingle(),
		supabase
			.from("keys")
			.select("id, name, prefix")
			.eq("workspace_id", workspaceId)
			.neq("status", "deleted")
			.neq("name", CHAT_MANAGED_KEY_NAME)
			.order("created_at", { ascending: false }),
		supabase
			.from("data_api_providers")
			.select("api_provider_id, api_provider_name")
			.order("api_provider_name", { ascending: true }),
		supabase
			.from("data_api_provider_models")
			.select(
				"provider_id, api_model_id, model_id, is_active_gateway",
			)
			.eq("is_active_gateway", true),
	]);

	if (teamResult.error) throw new Error(teamResult.error.message);
	if (keysResult.error) throw new Error(keysResult.error.message);
	if (providersResult.error) throw new Error(providersResult.error.message);
	if (activeProviderModelsResult.error) {
		throw new Error(activeProviderModelsResult.error.message);
	}

	const canonicalModelIds = Array.from(
		new Set(
			(activeProviderModelsResult.data ?? [])
				.map((row: any) => row?.model_id as string | null)
				.filter((id): id is string => Boolean(id)),
		),
	);
	const { data: activeModels, error: activeModelsError } = canonicalModelIds.length
		? await supabase
				.from("data_models")
				.select("model_id, name, organisation_id")
				.in("model_id", canonicalModelIds)
		: { data: [] as any[], error: null as any };
	if (activeModelsError) {
		throw new Error(activeModelsError.message);
	}
	const activeModelMap = new Map<string, any>();
	for (const row of activeModels ?? []) {
		if (typeof row?.model_id === "string") {
			activeModelMap.set(row.model_id, row);
		}
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
		const canonicalModelId = (row as any).model_id as string | null;
		const modelRow = canonicalModelId ? activeModelMap.get(canonicalModelId) ?? null : null;
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
