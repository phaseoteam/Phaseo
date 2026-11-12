import { useEffect, useState } from "react";
import useSWR from "swr";
import { connectedHarnesses } from "../../shared/rememberedModels";
import type { Harness } from "../../shared/workspace";
import { emptyOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";
import { BACKGROUND_REFRESH_MS } from "./useBackgroundRefresh";
import { providerHealthMs } from "./providerHealth";

/** The agents a chat can run on now, by the same rule phones use (shared/rememberedModels.ts's connectedHarnesses). */
export function useConnectedHarnesses() {
	return useConnectedHarnessesState().harnesses;
}

/** As useConnectedHarnesses, plus whether both answers have arrived; until then an empty set means "not known yet". */
export function useConnectedHarnessesState() {
	const api = window.phaseoDesktop?.workspace;
	const [overview, setOverview] = useState(emptyOverview);
	const [overviewLoaded, setOverviewLoaded] = useState(!api);
	useEffect(() => {
		if (!api) return;
		let active = true;
		const loaded = (value: WorkspaceOverview) => { setOverview(value); setOverviewLoaded(true); };
		void api.overview().then(value => { if (active) loaded(value); }, () => { if (active) setOverviewLoaded(true); });
		const unsubscribe = api.onOverviewChange(loaded);
		return () => { active = false; unsubscribe(); };
	}, [api]);
	// Main checks the local agents once for the window and phones, and keeps the answer for a minute. Re-checked as
	// often as Settings → Agents → Health checks says.
	const { data, error } = useSWR<Harness[]>(api ? "connected-local-harnesses" : null, () => api!.connectedHarnesses(), { dedupingInterval: providerHealthMs() || BACKGROUND_REFRESH_MS, refreshInterval: providerHealthMs(), revalidateOnFocus: false });
	return { harnesses: connectedHarnesses(data ?? [], overview), loaded: overviewLoaded && (!api || data !== undefined || error !== undefined) };
}
