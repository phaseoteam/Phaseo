"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";

export const LIVE_POLL_MS = 15_000;

/** Whether the person is typing somewhere, so a refresh now would get in their way. */
function typing(): boolean {
	const active = document.activeElement as HTMLElement | null;
	if (!active) return false;
	return active.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
}

/**
 * Keeps a work page current: every 15 seconds while the tab is visible it asks the account API
 * for a version stamp (the workspace's newest change, or one item's), straight from the browser,
 * and refreshes the page's server data when the stamp moves. It waits while someone is typing.
 */
export function WorkLiveRefresh({ workspaceId, number }: { workspaceId: string; number?: number }) {
	const router = useRouter();
	const stamp = useRef<string | null | undefined>(undefined);
	const pending = useRef(false);

	useEffect(() => {
		let stopped = false;
		const query = new URLSearchParams({ workspaceId });
		if (number) query.set("number", String(number));
		const check = async () => {
			if (stopped || document.visibilityState !== "visible") return;
			if (pending.current && !typing()) {
				pending.current = false;
				router.refresh();
				return;
			}
			try {
				const token = await getBrowserAccessToken();
				const response = await fetch(`/api/account/work/live?${query.toString()}`, { headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
				if (!response.ok) return;
				const next = ((await response.json()) as { stamp?: string | null }).stamp ?? null;
				if (stamp.current === undefined) { stamp.current = next; return; }
				if (next === stamp.current) return;
				stamp.current = next;
				if (typing()) pending.current = true;
				else router.refresh();
			} catch {
				// Offline or signed out: try again at the next tick.
			}
		};
		void check();
		const timer = window.setInterval(() => void check(), LIVE_POLL_MS);
		const onVisible = () => { if (document.visibilityState === "visible") void check(); };
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			stopped = true;
			window.clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [workspaceId, number, router]);

	return null;
}
