import { useEffect } from "react";
import { slowRequestLabel } from "../../shared/slowRequests";
import { toastManager } from "../components/ui/toast";

/** A loading toast while a request to the main process runs past ten seconds, gone as soon as it settles. */
export function useSlowRequestToasts() {
	useEffect(() => {
		const desktop = window.phaseoDesktop;
		if (!desktop?.onSlowRequest) return;
		const shown = new Map<number, string>();
		const unsubscribe = desktop.onSlowRequest(event => {
			if (event.state === "slow") shown.set(event.id, toastManager.add({ type: "loading", title: "Still working…", description: `Phaseo is taking longer than usual on ${slowRequestLabel(event.name)}.`, timeout: 0 }));
			else { const toast = shown.get(event.id); shown.delete(event.id); if (toast) toastManager.close(toast); }
		});
		return () => { unsubscribe(); for (const toast of shown.values()) toastManager.close(toast); };
	}, []);
}
