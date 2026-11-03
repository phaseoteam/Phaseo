import { handleScheduledEvent } from "@/scheduled";
import { runWithDatabaseScope } from "@/runtime/database";
import type { GatewayBindings } from "@/runtime/env";

// Scheduled-only entrypoint. Durable Objects stay owned by phaseo-gateway.
// The database scope is a straight call under DATABASE_PROVIDER=supabase (runtime/database.ts).
export default {
	scheduled(event: ScheduledController, env: GatewayBindings, ctx?: ExecutionContext): Promise<void> {
		return runWithDatabaseScope(env, ctx, () => handleScheduledEvent(event, env));
	},
};
