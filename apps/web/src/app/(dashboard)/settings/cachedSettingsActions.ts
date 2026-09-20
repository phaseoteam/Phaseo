"use server";

import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import type { AccountQueryScope } from "@/lib/query/queryKeys";
import { fetchSettingsAppsInitialData } from "@/lib/fetchers/internal/fetchSettingsAppsInitialData";
import { fetchSettingsAuthorizedAppsInitialData } from "@/lib/fetchers/internal/fetchSettingsAuthorizedAppsInitialData";
import { fetchSettingsDynamicRoutesInitialData } from "@/lib/fetchers/internal/fetchSettingsDynamicRoutesInitialData";
import { fetchSettingsKeysInitialData } from "@/lib/fetchers/internal/fetchSettingsKeysInitialData";
import { fetchSettingsManagementApiKeysInitialData } from "@/lib/fetchers/internal/fetchSettingsManagementApiKeysInitialData";
import { fetchSettingsRoutingInitialData } from "@/lib/fetchers/internal/fetchSettingsRoutingInitialData";
import { fetchSettingsGuardrailsInitialData } from "@/lib/fetchers/internal/fetchSettingsGuardrailsInitialData";
import { fetchSettingsPrivacyInitialData } from "@/lib/fetchers/internal/fetchSettingsPrivacyInitialData";
import { fetchSettingsByokInitialData } from "@/lib/fetchers/internal/fetchSettingsByokInitialData";
import { fetchSettingsPresetsInitialData } from "@/lib/fetchers/internal/fetchSettingsPresetsInitialData";
import { fetchSettingsPrivateModels } from "@/lib/fetchers/internal/fetchSettingsPrivateModels";
import { fetchSettingsTeamsInitialData } from "@/lib/fetchers/internal/fetchSettingsTeamsInitialData";
import { fetchSettingsUsageAlertsInitialData } from "@/lib/fetchers/internal/fetchSettingsUsageAlertsInitialData";
import { fetchSettingsCreditsTransactionsInitialData } from "@/lib/fetchers/internal/fetchSettingsCreditsTransactionsInitialData";
import { fetchSettingsAccountDetailsInitialData } from "@/lib/fetchers/internal/fetchSettingsAccountDetailsInitialData";
import { WebApiError } from "@/lib/web-api/client";
import { fetchSettingsProfileInitialData } from "@/lib/fetchers/internal/fetchSettingsProfileInitialData";
import { fetchSettingsProfileUsageSummary } from "@/lib/fetchers/internal/fetchSettingsProfileUsageSummary";
import { fetchSettingsProfileGames } from "@/lib/fetchers/internal/fetchSettingsProfileGames";
import { catalogueGamesEnabled } from "@/lib/games/preview";
import { fetchSettingsCreditsInitialData } from "@/lib/fetchers/internal/fetchSettingsCreditsInitialData";
import { fetchSettingsPresetFeedback } from "@/lib/fetchers/internal/fetchSettingsPresetFeedback";
import { fetchSettingsOAuthAppsInitialData } from "@/lib/fetchers/internal/fetchSettingsOAuthAppsInitialData";
import { fetchSettingsOAuthAppDetailInitialData } from "@/lib/fetchers/internal/fetchSettingsOAuthAppDetailInitialData";
import { fetchSettingsBetaInitialData } from "@/lib/fetchers/internal/fetchSettingsBetaInitialData";
import { fetchSettingsObservabilityDestinationNewInitialData } from "@/lib/fetchers/internal/fetchSettingsObservabilityDestinationNewInitialData";

async function readOAuthApp(clientId?: string) {
	if (!clientId) throw new Error("Missing OAuth client ID");
	return fetchSettingsOAuthAppDetailInitialData(clientId);
}

async function readBroadcastForm(provider?: string) {
	if (!provider) throw new Error("Missing broadcast provider");
	return fetchSettingsObservabilityDestinationNewInitialData(provider);
}

async function readProfile() {
	const gamesEnabled = await catalogueGamesEnabled();
	const [identity, { usage }, { games }] = await Promise.all([
		fetchSettingsProfileInitialData(), fetchSettingsProfileUsageSummary(),
		gamesEnabled ? fetchSettingsProfileGames() : Promise.resolve({ games: null }),
	]);
	return { ...identity, usage, games, gamesEnabled, signedIn: Boolean(identity.profile) };
}

async function readNotifications() {
	const data = await fetchSettingsCreditsInitialData();
	// Exclude wallet, payment and MFA data from the browser cache.
	return {
		autoTopUpFailureEmailEnabled: data.autoTopUpFailureEmailEnabled,
		lowBalanceEmailEnabled: data.lowBalanceEmailEnabled,
		paymentMethodExpiringEmailEnabled: data.paymentMethodExpiringEmailEnabled,
		lowBalanceEmailThresholdUsd: data.lowBalanceEmailThresholdUsd,
		notificationDestinations: data.notificationDestinations,
		notificationRoutes: data.notificationRoutes,
		modelDeprecationAlertsEnabled: data.modelDeprecationAlertsEnabled,
	};
}

// Explicit read-only allowlist. Secret reveals, checkout and MFA are intentionally absent.
const readers = {
	"oauth-apps": fetchSettingsOAuthAppsInitialData,
	"oauth-app": readOAuthApp,
	beta: fetchSettingsBetaInitialData,
	"broadcast-form": readBroadcastForm,
	"preset-feedback": fetchSettingsPresetFeedback,
	profile: readProfile,
	notifications: readNotifications,
	apps: fetchSettingsAppsInitialData,
	"authorized-apps": fetchSettingsAuthorizedAppsInitialData,
	"dynamic-routes": fetchSettingsDynamicRoutesInitialData,
	keys: fetchSettingsKeysInitialData,
	"management-api-keys": fetchSettingsManagementApiKeysInitialData,
	routing: fetchSettingsRoutingInitialData,
	guardrails: fetchSettingsGuardrailsInitialData,
	privacy: fetchSettingsPrivacyInitialData,
	byok: fetchSettingsByokInitialData,
	presets: fetchSettingsPresetsInitialData,
	"private-models": fetchSettingsPrivateModels,
	teams: fetchSettingsTeamsInitialData,
	"usage-alerts": fetchSettingsUsageAlertsInitialData,
	transactions: fetchSettingsCreditsTransactionsInitialData,
	"account-details": fetchSettingsAccountDetailsInitialData,
};

export type SettingsResource = keyof typeof readers;
export type SettingsResourceData<K extends SettingsResource> = Awaited<ReturnType<(typeof readers)[K]>>;

export async function readCachedSettings<K extends SettingsResource>(resource: K, scope: AccountQueryScope, preferredWorkspaceId?: string, parameters?: string): Promise<{ data: SettingsResourceData<K> } | { denied: 401 | 403 }> {
	if (!Object.hasOwn(readers, resource)) throw new Error("Unknown settings resource");
	const context = await getServerAccountContext();
	if (!context.accessToken || !scope.userId || context.userId !== scope.userId) return { denied: 401 };
	const accountOnly = resource === "authorized-apps" || resource === "account-details" || resource === "profile" || resource === "beta";
	if (!accountOnly && (!scope.workspaceId || context.workspaceId !== scope.workspaceId)) return { denied: 403 };
	// The existing read still enforces workspace membership on the API. No server cache.
	try {
		const data = resource === "keys" ? await fetchSettingsKeysInitialData(preferredWorkspaceId)
			: resource === "teams" ? await fetchSettingsTeamsInitialData(preferredWorkspaceId)
			: resource === "preset-feedback" ? await fetchSettingsPresetFeedback(parameters)
			: resource === "oauth-app" ? await readOAuthApp(parameters)
			: resource === "broadcast-form" ? await readBroadcastForm(parameters)
			: await readers[resource]();
		return { data: data as SettingsResourceData<K> };
	} catch (error) {
		if (error instanceof WebApiError && (error.status === 401 || error.status === 403)) return { denied: error.status };
		throw error;
	}
}
