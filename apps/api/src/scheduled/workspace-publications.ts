// Purpose: Drain the workspace cache-publication outbox.
// Why: Database triggers record a publication intent whenever workspace
//      settings, BYOK keys, guardrails, dynamic routes, private models, tier or
//      billing mode change. Draining it invalidates every cached request
//      context of that workspace, including changes made outside the gateway
//      control routes.
// How: Claim leased batches, bump the workspace cache version, drop the
//      private-route snapshot, then acknowledge with the claimed revision.

import { getSupabaseAdmin } from "@/runtime/env";
import { bumpWorkspacePolicyVersion } from "@/pipeline/before/workspacePolicy";
import { invalidatePrivateRoutes } from "@/pipeline/before/privateModelCache";

const BATCH_SIZE = 100;
const MAX_BATCHES_PER_RUN = 5;

type ClaimedPublication = { workspace_id: string; revision: string; lease_id: string };

export type WorkspacePublicationSummary = {
	claimed: number;
	completed: number;
	failed: number;
};

async function publish(publication: ClaimedPublication): Promise<boolean> {
	try {
		await bumpWorkspacePolicyVersion(publication.workspace_id);
		await invalidatePrivateRoutes(publication.workspace_id);
		return true;
	} catch (error) {
		console.error("workspace_publication_failed", {
			workspaceId: publication.workspace_id,
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}

export async function drainWorkspacePublications(): Promise<WorkspacePublicationSummary> {
	const supabase = getSupabaseAdmin();
	const summary: WorkspacePublicationSummary = { claimed: 0, completed: 0, failed: 0 };
	for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
		const { data, error } = await supabase
			.rpc("gateway_claim_workspace_publications", { p_limit: BATCH_SIZE })
			.abortSignal(AbortSignal.timeout(10_000));
		if (error) throw new Error(`workspace_publication_claim_failed:${error.message ?? "unknown"}`);
		const claimed = (data ?? []) as ClaimedPublication[];
		summary.claimed += claimed.length;
		await Promise.all(claimed.map(async (publication) => {
			const success = await publish(publication);
			const { error: finishError } = await supabase.rpc("gateway_finish_workspace_publication", {
				p_workspace_id: publication.workspace_id,
				p_revision: publication.revision,
				p_lease_id: publication.lease_id,
				p_success: success,
			});
			if (success && !finishError) summary.completed++;
			else summary.failed++;
		}));
		if (claimed.length < BATCH_SIZE) break;
	}
	return summary;
}
