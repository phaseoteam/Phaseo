/**
 * Monthly Dormant Team Cleanup Cron Job
 * Purpose: Clean up dormant Enterprise teams that stopped making requests
 * Schedule: Runs at 00:00 UTC on the 1st of each month
 *
 * HOW IT WORKS:
 * - Active teams: Tier calculated in real-time before each request (context.sql)
 * - Dormant teams: Cleaned up monthly via this cron (prevents indefinite Enterprise status)
 *
 * Setup Instructions (Option 1 - Preferred):
 * Use Supabase's built-in pg_cron extension:
 * SELECT cron.schedule(
 *     'cleanup-dormant-enterprise-teams',
 *     '0 0 1 * *',
 *     $$SELECT cleanup_dormant_enterprise_teams()$$
 * );
 *
 * Setup Instructions (Option 2 - Cloudflare Workers):
 * 1. Add to wrangler.toml: [triggers] crons = ["0 0 1 * *"]
 * 2. Export the handleScheduledEvent function
 * 3. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set
 *
 * See TIER-SYSTEM.md for full documentation.
 */

import { getSupabaseAdmin } from "@/runtime/env";

export interface TierCleanupResult {
    success: boolean;
    total_teams_checked: number;
    teams_downgraded: number;
    downgraded_teams: Array<{
        team_id: string;
        old_tier: string;
        new_tier: string;
        spend_30d_usd: number;
    }>;
    processed_at: string;
    error?: string;
}

/**
 * Execute monthly cleanup for dormant Enterprise teams
 * Calls the Supabase RPC function cleanup_dormant_enterprise_teams()
 *
 * Active teams are handled by per-request tier calculation in context.sql
 * This cron handles teams that stopped making requests while on Enterprise tier
 */
export async function executeDormantTeamCleanup(): Promise<TierCleanupResult> {
    try {
        const supabase = getSupabaseAdmin();

        console.log("[tier-cron] Starting dormant Enterprise team cleanup...");

        // Call the RPC function to cleanup dormant teams
        const { data, error } = await supabase.rpc("cleanup_dormant_enterprise_teams");

        if (error) {
            console.error("[tier-cron] Error cleaning up dormant teams:", error);
            return {
                success: false,
                total_teams_checked: 0,
                teams_downgraded: 0,
                downgraded_teams: [],
                processed_at: new Date().toISOString(),
                error: error.message,
            };
        }

        console.log("[tier-cron] Cleanup completed successfully:", {
            checked: data.total_teams_checked,
            downgraded: data.teams_downgraded,
        });

        return {
            success: true,
            total_teams_checked: data.total_teams_checked ?? 0,
            teams_downgraded: data.teams_downgraded ?? 0,
            downgraded_teams: data.downgraded_teams ?? [],
            processed_at: data.processed_at ?? new Date().toISOString(),
        };
    } catch (err) {
        console.error("[tier-cron] Unexpected error:", err);
        return {
            success: false,
            total_teams_checked: 0,
            teams_downgraded: 0,
            downgraded_teams: [],
            processed_at: new Date().toISOString(),
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

/**
 * Cloudflare Workers Cron Handler
 * Add to wrangler.toml:
 *
 * [triggers]
 * crons = ["0 0 1 * *"]  # Midnight UTC on 1st of month
 */
export async function handleScheduledEvent(event: ScheduledEvent): Promise<void> {
    console.log("[tier-cron] Cron triggered at:", new Date(event.scheduledTime).toISOString());

    const result = await executeDormantTeamCleanup();

    if (result.success) {
        console.log(`[tier-cron] ✅ Checked ${result.total_teams_checked} Enterprise teams, downgraded ${result.teams_downgraded}`);
    } else {
        console.error(`[tier-cron] ❌ Failed: ${result.error}`);
    }
}

/**
 * HTTP Handler (for manual trigger or testing)
 * Can be called via: POST /api/admin/cleanup-dormant-teams
 */
export async function handleManualTrigger(request: Request): Promise<Response> {
    // Verify authorization (you should add proper auth here)
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    // TODO: Verify the bearer token against your admin secret

    console.log("[tier-cron] Manual cleanup trigger requested");

    const result = await executeDormantTeamCleanup();

    return new Response(JSON.stringify(result, null, 2), {
        status: result.success ? 200 : 500,
        headers: { "Content-Type": "application/json" },
    });
}
