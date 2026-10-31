"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { StatsigClient } from "@statsig/js-client";
import { useReportWebVitals } from "next/web-vitals";
import { isAnalyticsCaptureAllowed } from "@/lib/clientErrorReporting";
import { ANALYTICS_CONSENT_EVENT } from "@/lib/cookieConsent";
import { captureProductEvent } from "@/lib/productAnalytics";
import { buildAnonymousStatsigUser, readStableIdCookie, writeStableIdCookie } from "@/lib/statsig/shared";
import { MODELS_LAYOUT_EXPERIMENT, selectModelsLayout, type ModelsLayout } from "./modelsLayoutExperiment";

type LayoutEvent = "models_layout_first_rows" | "models_layout_model_opened" | "models_layout_model_id_copied" | "models_layout_filter_changed" | "models_layout_web_vital";
type EventProperties = { model_id?: string; control?: string; metric?: string; value?: number; rating?: string };
type Assignment = { variant: ModelsLayout; client?: StatsigClient; inExperiment?: boolean };
export const ModelsLayoutTrackingContext = createContext<(event: LayoutEvent, properties?: EventProperties) => void>(() => {});
export const useModelsLayoutTracking = () => useContext(ModelsLayoutTrackingContext);

export function useModelsLayoutExperiment(enabled: boolean) {
	const [assignment, setAssignment] = useState<Assignment | null>(null);
	const mountedAt = useRef<number | null>(null);
	const firstRowsReported = useRef(false);
	const pendingVitals = useRef<EventProperties[]>([]);
	const vitalSink = useRef<((properties: EventProperties) => void) | null>(null);
	const vitalsActive = useRef(false);

	useEffect(() => {
		if (!enabled) return;
		// Document vitals on a client navigation can belong to the previous route.
		// First-row timing covers client navigations; report vitals only for /models document loads.
		const navigation = performance.getEntriesByType("navigation")[0];
		vitalsActive.current = !!navigation && new URL(navigation.name).pathname === window.location.pathname;
		mountedAt.current = performance.now();
		let active = true;
		let settled = false;
		let client: StatsigClient | undefined;
		let evaluated = false;
		const settle = (result: Assignment) => {
			if (!active || settled) return;
			settled = true;
			setAssignment(result);
		};
		// Freeze the fallback too: late network responses must never swap a visible layout.
		const timeout = window.setTimeout(() => settle({ variant: "cards" }), 1500);
		const syncConsent = () => {
			client?.updateRuntimeOptions({ loggingEnabled: isAnalyticsCaptureAllowed() ? "browser-only" : "disabled" });
			if (evaluated && isAnalyticsCaptureAllowed()) client?.getExperiment(MODELS_LAYOUT_EXPERIMENT, { disableExposureLog: false });
		};
		window.addEventListener(ANALYTICS_CONSENT_EVENT, syncConsent);
		window.addEventListener("storage", syncConsent);
		void (async () => {
			const key = process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY;
			if (!key) { settle({ variant: "cards" }); return; }
			const { StatsigClient } = await import("@statsig/js-client");
			if (!active || settled) return;
			const stableID = readStableIdCookie() ?? crypto.randomUUID();
			writeStableIdCookie(stableID);
			const user = buildAnonymousStatsigUser(stableID);
			client = new StatsigClient(key, user, {
				loggingEnabled: isAnalyticsCaptureAllowed() ? "browser-only" : "disabled",
			});
			const assign = () => {
				if (!client) return;
				// getExperiment logs the standard exposure; use the same device identity for both variants.
				const experiment = client.getExperiment(MODELS_LAYOUT_EXPERIMENT, { disableExposureLog: !isAnalyticsCaptureAllowed() });
				evaluated = true;
				settle({ variant: selectModelsLayout(experiment), client, inExperiment: !!experiment.groupName });
			};
			// Returning visitors already have values cached from their last visit,
			// so their group is known without waiting on the network. initializeSync
			// refreshes only the cache for next time, so live values never change
			// under the frozen layout. Only first visits wait (up to the timeout).
			const cached = client.initializeSync();
			if (cached.source === "Cache") {
				assign();
				return;
			}
			const update = await client.updateUserAsync(user);
			if (!active || settled) return;
			if (!update.success) { settle({ variant: "cards" }); return; }
			assign();
		})().catch(() => settle({ variant: "cards" }));
		return () => {
			active = false;
			vitalsActive.current = false;
			window.clearTimeout(timeout);
			window.removeEventListener(ANALYTICS_CONSENT_EVENT, syncConsent);
			window.removeEventListener("storage", syncConsent);
			void client?.shutdown();
		};
	}, [enabled]);

	const track = useCallback((event: LayoutEvent, properties: EventProperties = {}) => {
		if (!enabled || !assignment || !isAnalyticsCaptureAllowed()) return;
		const metadata = { experiment: MODELS_LAYOUT_EXPERIMENT, variant: assignment.variant, in_experiment: assignment.inExperiment ?? false, ...properties };
		captureProductEvent(event, metadata);
		assignment.client?.logEvent(event, properties.value, Object.fromEntries(
			Object.entries(metadata).map(([key, value]) => [key, String(value)]),
		));
	}, [assignment, enabled]);

	// Keep one subscription: Next's hook does not unsubscribe when its callback changes.
	useReportWebVitals(useCallback((metric) => {
		if (!vitalsActive.current || !["LCP", "INP", "CLS"].includes(metric.name)) return;
		const properties = { metric: metric.name, value: metric.value, rating: metric.rating };
		if (vitalSink.current) vitalSink.current(properties);
		else pendingVitals.current.push(properties);
	}, []));

	useEffect(() => {
		if (!assignment) return;
		vitalSink.current = (properties) => track("models_layout_web_vital", properties);
		for (const metric of pendingVitals.current.splice(0)) track("models_layout_web_vital", metric);
		return () => { vitalSink.current = null; };
	}, [assignment, track]);

	const rowsRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!assignment || !enabled || firstRowsReported.current) return;
		let frame = 0;
		let scheduled = false;
		// Virtualized rows may arrive after the container commits. Wait for a real model link.
		const observeRows = () => {
			if (scheduled || document.visibilityState !== "visible" || !rowsRef.current?.querySelector('a[href*="/models/"]')) return;
			scheduled = true;
			frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
				firstRowsReported.current = true;
				track("models_layout_first_rows", { value: performance.now() - (mountedAt.current ?? performance.now()) });
			}); });
		};
		const observer = new MutationObserver(observeRows);
		if (rowsRef.current) observer.observe(rowsRef.current, { childList: true, subtree: true });
		document.addEventListener("visibilitychange", observeRows);
		observeRows();
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			document.removeEventListener("visibilitychange", observeRows);
		};
	}, [assignment, enabled, track]);

	return { variant: assignment?.variant ?? "cards", ready: !enabled || assignment !== null, track, rowsRef };
}
