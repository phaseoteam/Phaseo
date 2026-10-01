import { isDataContributionAccessEnabled } from "@/core/feature-flags";
import { L1Cache } from "@/runtime/cache/l1";
import { byokMetaSchema } from "./schemas";
import { isWorkspaceRuntimeFresh, type WorkspaceRuntimeSnapshot } from "./workspaceRuntimeSnapshot";
import type { GatewayContextData, TeamSettings } from "./types";

/** Keep the legacy source and snapshot paths on one settings translation. */
export async function workspaceTeamSettings(settings: Record<string, any>, billingMode: unknown, workspaceId: string, contributionAccess?: boolean): Promise<TeamSettings> {
    const rawBillingMode = String(billingMode ?? "").trim().toLowerCase();
    if (rawBillingMode !== "wallet" && rawBillingMode !== "invoice") {
        throw new Error("workspace_billing_mode_invalid");
    }
    const cacheAwareRoutingEnabled = (
        settings as Record<string, unknown>
    ).cache_aware_routing_enabled;
    const dataContributionFeatureEnabled =
        settings.data_contribution_enabled === true &&
        (contributionAccess ?? await isDataContributionAccessEnabled({ workspaceId }));
    const responseHealingEnabled =
        settings.response_healing_enabled === true;
    const responseHealingLocked =
        settings.response_healing_locked === true;
    const responseHealingMode =
        settings.response_healing_mode === "strict"
            ? "strict"
            : "safe";
    return {
        routingMode: settings.routing_mode ?? null,
        byokFallbackEnabled: settings.byok_fallback_enabled === true,
        betaChannelEnabled: settings.beta_channel_enabled === true,
        alphaChannelEnabled: settings.alpha_channel_enabled === true,
        cacheAwareRoutingEnabled:
            typeof cacheAwareRoutingEnabled === "boolean"
                ? cacheAwareRoutingEnabled
                : null,
        privacyZdrOnly: settings.privacy_zdr_only === true,
        privacyEnablePaidMayTrain:
            settings.privacy_enable_paid_may_train === true,
        privacyEnableFreeMayTrain:
            settings.privacy_enable_free_may_train === true,
        privacyEnableInputOutputLogging:
            settings.privacy_enable_input_output_logging === true,
        ioLoggingEnabled: settings.io_logging_enabled === true,
        ioLoggingIncludeProviderPayloads:
            settings.io_logging_include_provider_payloads === true,
        dataContributionEnabled:
            dataContributionFeatureEnabled,
        dataContributionPolicyVersion:
            settings.data_contribution_policy_version ?? null,
        dataContributionSampleRateBps:
            Number(settings.data_contribution_sample_rate_bps ?? 10000),
        dataContributionClassifierSampleRateBps:
            Number(settings.data_contribution_classifier_sample_rate_bps ?? 1000),
        dataContributionDiscountBps:
            Number(settings.data_contribution_discount_bps ?? 100),
        defaultPlugins:
            responseHealingEnabled || responseHealingLocked
                ? [{
                    id: "response-healing",
                    enabled: responseHealingEnabled,
                    config: { mode: responseHealingMode },
                    ...(responseHealingLocked ? { preventOverrides: true } : {}),
                }]
                : null,
        billingMode: rawBillingMode,
    };
    
}

/** Overlay current private configuration after reading independent cache segments.
 * Never merge financial/key admission from a workspace snapshot. */
const contributionAccessLeases = new L1Cache<boolean>({ namespace: "workspace-contribution-access", maxEntries: 512,
    maxBytes: 128 * 1024, maxEntryBytes: 512, maxPending: 32, sizeOf: (_value, key) => key.length * 2 + 64 });

export async function composeWorkspaceRuntime(value: GatewayContextData, snapshot: WorkspaceRuntimeSnapshot): Promise<GatewayContextData> {
    if (!isWorkspaceRuntimeFresh(snapshot, value.workspaceId)) throw new Error("workspace_runtime_composition_expired");
    // Consent itself always comes from this snapshot. The independent external
    // rollout decision must not become a Statsig network call on every request.
    const contributionAccess = snapshot.settings.data_contribution_enabled === true
        ? await contributionAccessLeases.getOrLoad(value.workspaceId, async () => ({
            value: await isDataContributionAccessEnabled({ workspaceId: value.workspaceId }),
            expiresAtMs: Math.min(snapshot.expiresAtMs, Date.now() + 30_000),
        })) : false;
    const teamSettings = await workspaceTeamSettings(snapshot.settings, snapshot.billingMode, value.workspaceId, contributionAccess);
    if (!isWorkspaceRuntimeFresh(snapshot, value.workspaceId)) throw new Error("workspace_runtime_composition_expired");
    return {
        ...value, teamSettings, workspaceRuntimeExpiresAt: snapshot.expiresAtMs,
        providers: value.providers.map(provider => ({
            ...provider,
            byokMeta: (snapshot.byok[provider.providerId] ?? []).map(reference => byokMetaSchema.parse(reference)),
        })),
    };
}
