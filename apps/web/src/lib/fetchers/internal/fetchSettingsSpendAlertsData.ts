import type { SettingsSpendAlertsData, SettingsSpendRuleOptions, SettingsSpendRulesInitialData } from "@/lib/fetchers/internal/settingsTypes";
import type { SpendRulePreview } from "@/components/(gateway)/settings/spend-rules/spendRules";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

/**
 * The Spend alerts section of Settings → Notifications: the rules, what the editor's pickers
 * offer, and the current value of each enabled rule the evaluator handles (one preview call
 * each; a workspace has at most 50 rules). A preview that fails is left out, so the list still
 * renders without its percentage.
 */
export async function fetchSettingsSpendAlertsData(): Promise<SettingsSpendAlertsData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	const [list, options] = await Promise.all([
		fetchAccountWebApi<SettingsSpendRulesInitialData>(`/api/account/settings/spend-rules${query}`, context.accessToken),
		fetchAccountWebApi<SettingsSpendRuleOptions>(`/api/account/settings/spend-rules/options${query}`, context.accessToken),
	]);
	const previewed = list.rules.filter((rule) => rule.enabled && rule.evaluated);
	const previews = await Promise.all(previewed.map(async (rule) => {
		try {
			const { preview } = await fetchAccountWebApi<{ preview: SpendRulePreview }>(
				`/api/account/settings/spend-rules/${encodeURIComponent(rule.id)}/preview${query}`,
				context.accessToken,
			);
			return [rule.id, preview] as const;
		} catch {
			return null;
		}
	}));
	return { ...list, options, previews: Object.fromEntries(previews.filter((entry) => entry !== null)) };
}
