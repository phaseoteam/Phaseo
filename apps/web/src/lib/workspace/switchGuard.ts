import { useEffect, useRef, useState } from "react";

const beforeWorkspaceSwitch = "phaseo:before-workspace-switch";
type SwitchRequest = CustomEvent<Promise<boolean>[]>;

// Workspace switching updates the session before refreshing routes, so route blockers cannot protect drafts.
export async function confirmWorkspaceSwitch() {
	const confirmations: Promise<boolean>[] = [];
	window.dispatchEvent(new CustomEvent(beforeWorkspaceSwitch, { detail: confirmations }));
	return (await Promise.all(confirmations)).every(Boolean);
}

export function useWorkspaceSwitchGuard(enabled: boolean) {
	const [active, setActive] = useState(false);
	const pending = useRef<((confirmed: boolean) => void)[]>([]);
	function resolve(confirmed: boolean) {
		pending.current.splice(0).forEach((finish) => finish(confirmed));
		setActive(false);
	}
	useEffect(() => {
		if (!enabled) return;
		const requests = pending.current;
		function block(event: Event) {
			(event as SwitchRequest).detail.push(new Promise((finish) => requests.push(finish)));
			setActive(true);
		}
		window.addEventListener(beforeWorkspaceSwitch, block);
		return () => {
			window.removeEventListener(beforeWorkspaceSwitch, block);
			requests.splice(0).forEach((finish) => finish(false));
			setActive(false);
		};
	}, [enabled]);
	return { active, accept: () => resolve(true), reject: () => resolve(false) };
}
