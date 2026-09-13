import type { Env } from '@/env';
import type { AccountWorkspaceContext } from './context';

async function invalidateGatewayKey(env: Env, keyId: string): Promise<void> {
	const key = env.PHASEO_CONTROL_KEY;
	if (!key || !env.PHASEO_CONTROL_SECRET) throw new Error("gateway_invalidation_unavailable");
	const response = await fetch(
		`${(env.GATEWAY_API_ORIGIN ?? "http://localhost:8787").replace(/\/$/, "")}/v1/keys/${encodeURIComponent(keyId)}/invalidate`,
		{
			method: "POST",
			headers: {
				authorization: `Bearer ${key}`,
				"x-control-secret": env.PHASEO_CONTROL_SECRET,
			},
		},
	);
	if (!response.ok) throw new Error("gateway_invalidation_failed");
}

export async function invalidateWorkspaceGatewayContext(
	context: AccountWorkspaceContext,
	env: Env,
): Promise<boolean> {
	const keys = await context.client
		.from("keys")
		.select("id")
		.eq("workspace_id", context.workspaceId)
		.neq("status", "deleted");
	if (keys.error) throw new Error("gateway_invalidation_unavailable");
	if (!(keys.data ?? []).length) return true;
	if (!env.PHASEO_CONTROL_KEY || !env.PHASEO_CONTROL_SECRET) return false;
	await Promise.all((keys.data ?? []).map((row) => invalidateGatewayKey(env, String(row.id))));
	return true;
}
