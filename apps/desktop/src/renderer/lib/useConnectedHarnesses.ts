import { useEffect, useState } from "react";
import useSWR from "swr";
import { connectedHarnesses } from "../../shared/rememberedModels";
import type { Harness } from "../../shared/workspace";
import { emptyOverview } from "../../shared/workspaceOverview";
import { BACKGROUND_REFRESH_MS } from "./useBackgroundRefresh";

/** The agents a chat can run on now, by the same rule phones use (shared/rememberedModels.ts's connectedHarnesses). */
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
	// Main checks the local agents once for the window and phones, and keeps the answer for a minute.
	const { data = [] } = useSWR<Harness[]>(api ? "connected-local-harnesses" : null, () => api!.connectedHarnesses(), { dedupingInterval: BACKGROUND_REFRESH_MS, refreshInterval: BACKGROUND_REFRESH_MS, revalidateOnFocus: false });
	return connectedHarnesses(data, overview);
}
