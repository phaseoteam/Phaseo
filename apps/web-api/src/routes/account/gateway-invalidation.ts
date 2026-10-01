import type { Env } from '@/env';
import type { AccountWorkspaceContext } from './context';

// The database mutation has already committed. Report publication separately;
// never turn a cache outage into a misleading failed/duplicated database write.
export async function invalidateWorkspaceGatewayContext(
	context: AccountWorkspaceContext,
	env: Env,
): Promise<boolean> {
	if (!env.PHASEO_CONTROL_KEY || !env.PHASEO_CONTROL_SECRET) return false;
	try {
		const response = await fetch(
			`${(env.GATEWAY_API_ORIGIN ?? "http://localhost:8787").replace(/\/$/, "")}/v1/workspaces/${encodeURIComponent(context.workspaceId)}/invalidate`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${env.PHASEO_CONTROL_KEY}`,
					"x-control-secret": env.PHASEO_CONTROL_SECRET,
				},
				signal: AbortSignal.timeout(5_000),
				redirect: "error",
			},
		);
		await response.body?.cancel();
		return response.ok;
	} catch {
		return false;
	}
}
