import { useEffect, useState } from "react";
import useSWR from "swr";
import type { Harness } from "../../shared/workspace";
import { emptyOverview } from "../../shared/workspaceOverview";
import { BACKGROUND_REFRESH_MS } from "./useBackgroundRefresh";
import { providerHealthMs } from "./providerHealth";

/**
 * The local agents found signed in last time. Finding the CLIs and asking each for its login takes 4 to 6 seconds at
 * launch, so the last answer shows at once while they are asked again; a sign-out drops out when that answer arrives.
 */
const connectedKey = "phaseo.desktop.connectedHarnesses";
const harnesses = new Set<string>(["codex", "claude", "grok", "opencode", "pi"]);
function lastConnected(): Harness[] {
	try { const value = JSON.parse(localStorage.getItem(connectedKey) ?? "[]") as unknown; return Array.isArray(value) ? value.filter((entry): entry is Harness => typeof entry === "string" && harnesses.has(entry)) : []; }
	catch { return []; }
}
function rememberConnected(value: Harness[]) {
	try { localStorage.setItem(connectedKey, JSON.stringify(value)); } catch { /* Only a faster next launch is lost. */ }
}

export function useConnectedHarnesses() {
	const api = window.phaseoDesktop?.workspace;
	const [overview, setOverview] = useState(emptyOverview);
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.overview().then(value => { if (active) setOverview(value); }, () => {});
		const unsubscribe = api.onOverviewChange(setOverview);
		return () => { active = false; unsubscribe(); };
	}, [api]);
	const { data = [] } = useSWR<Harness[]>(api ? "connected-local-harnesses" : null, async () => {
		const installed = await api!.installations();
		const results = await Promise.all(installed.filter(value => value.installed).map(async ({ harness }): Promise<Harness | undefined> => {
			try {
				if (harness === "codex" || harness === "claude" || harness === "grok") return (await api!.accountStatus(harness)).authenticated === true ? harness : undefined;
				if (harness === "opencode" || harness === "pi") return (await api!.models(harness)).length ? harness : undefined;
			} catch { /* An unavailable local login is not a connected runtime. */ }
			return undefined;
		}));
		return results.filter((value): value is Harness => !!value);
		// Re-checked as often as Settings → Agents → Health checks says.
	}, { fallbackData: lastConnected(), onSuccess: rememberConnected, dedupingInterval: providerHealthMs() || BACKGROUND_REFRESH_MS, refreshInterval: providerHealthMs(), revalidateOnFocus: false });
	const connected = new Set<Harness>(data);
	for (const account of overview.accounts) if (account.configured && !account.archived && (!account.oauthExpiresAt || Date.parse(account.oauthExpiresAt) > Date.now())) connected.add(account.harness);
	if (overview.agents.some(agent => !agent.archived)) connected.add("acp");
	return connected;
}
