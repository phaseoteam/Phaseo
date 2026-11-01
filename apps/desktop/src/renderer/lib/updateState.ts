import { useSyncExternalStore } from "react";
import type { DesktopRuntimeInfo, DesktopUpdateState } from "../../shared/desktop";
import { showToast } from "../components/ui/toast";

// The main process only sends changes, so one listener keeps the latest for every screen that shows it.
// Undefined until something is heard: nothing has been checked yet.
let state: DesktopUpdateState | undefined;
const listeners = new Set<() => void>();
let started = false, announced: string | undefined;

export function setUpdateState(next: DesktopUpdateState) {
	state = next;
	for (const listener of listeners) listener();
	// Once per downloaded version, so a finished download is noticed without opening a menu.
	if (next.status === "ready" && announced !== (next.version ?? "")) {
		announced = next.version ?? "";
		showToast("info", next.version ? `Phaseo ${next.version} is ready` : "An update is ready", "Restart Phaseo to finish updating.", { label: "Restart", onClick: () => void window.phaseoDesktop?.installUpdate() });
	}
}

function subscribe(listener: () => void) {
	if (!started) { started = true; window.phaseoDesktop?.onUpdateStateChange(setUpdateState); }
	listeners.add(listener);
	return () => { listeners.delete(listener); };
}

/** "0.4.2 (1a2b3c4)": the version, and the build's commit when it has one, as support asks for it. */
export function versionText(info: Pick<DesktopRuntimeInfo, "version" | "commit">) {
	return info.commit ? `${info.version} (${info.commit.slice(0, 7)})` : info.version;
}

export function useUpdateState() { return useSyncExternalStore(subscribe, () => state); }

/** Checks now, and shows the outcome everywhere the update state shows. */
export async function checkForUpdates() {
	const desktop = window.phaseoDesktop; if (!desktop) return;
	setUpdateState({ status: "checking" });
	setUpdateState(await desktop.checkForUpdates());
}
