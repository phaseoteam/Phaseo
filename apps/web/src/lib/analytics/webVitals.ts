// Core Web Vitals (LCP, INP, CLS) from PerformanceObserver, reported the way
// the `web-vitals` library does by default: one final value per metric, sent
// when the page is hidden (LCP also settles on the first interaction).
import { useEffect, useRef } from "react";

export type WebVitalName = "LCP" | "INP" | "CLS";
export type WebVitalRating = "good" | "needs-improvement" | "poor";
export type WebVitalMetric = { name: WebVitalName; value: number; rating: WebVitalRating };

// Same thresholds as web.dev: [good up to, poor above].
const THRESHOLDS: Record<WebVitalName, [number, number]> = {
	LCP: [2500, 4000],
	INP: [200, 500],
	CLS: [0.1, 0.25],
};

function rate(name: WebVitalName, value: number): WebVitalRating {
	const [good, poor] = THRESHOLDS[name];
	return value <= good ? "good" : value <= poor ? "needs-improvement" : "poor";
}

type LayoutShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean };
type EventTimingEntry = PerformanceEntry & { interactionId?: number };

/** Starts observing; returns a function that stops. Each metric is reported at most once per change. */
export function observeWebVitals(report: (metric: WebVitalMetric) => void): () => void {
	if (typeof PerformanceObserver === "undefined") return () => {};
	const observers: PerformanceObserver[] = [];
	const observe = (type: string, onEntries: (entries: PerformanceEntry[]) => void, options: Record<string, unknown> = {}) => {
		try {
			const observer = new PerformanceObserver((list) => onEntries(list.getEntries()));
			observer.observe({ type, buffered: true, ...options } as PerformanceObserverInit);
			observers.push(observer);
			return observer;
		} catch {
			// Entry type not supported in this browser.
			return null;
		}
	};
	const lastReported: Partial<Record<WebVitalName, number>> = {};
	const send = (name: WebVitalName, value: number) => {
		if (lastReported[name] === value) return;
		lastReported[name] = value;
		report({ name, value, rating: rate(name, value) });
	};

	// Largest Contentful Paint: the last candidate before the visitor interacts or leaves.
	let lcp: number | null = null;
	let lcpFinal = false;
	const lcpObserver = observe("largest-contentful-paint", (entries) => {
		const last = entries[entries.length - 1];
		if (last && !lcpFinal) lcp = last.startTime;
	});
	const finalizeLcp = () => {
		if (lcpFinal) return;
		lcpFinal = true;
		if (lcpObserver) {
			const pending = lcpObserver.takeRecords();
			const last = pending[pending.length - 1];
			if (last) lcp = last.startTime;
			lcpObserver.disconnect();
		}
		if (lcp !== null) send("LCP", lcp);
	};
	const onFirstInput = () => {
		finalizeLcp();
		removeEventListener("keydown", onFirstInput, true);
		removeEventListener("click", onFirstInput, true);
	};
	addEventListener("keydown", onFirstInput, { capture: true, once: true });
	addEventListener("click", onFirstInput, { capture: true, once: true });

	// Cumulative Layout Shift: the largest session window (shifts under 1s apart, at most 5s long).
	let cls = 0;
	let sessionValue = 0;
	let sessionStart = 0;
	let sessionLast = 0;
	observe("layout-shift", (entries) => {
		for (const entry of entries as LayoutShiftEntry[]) {
			if (entry.hadRecentInput) continue;
			if (sessionValue && entry.startTime - sessionLast < 1000 && entry.startTime - sessionStart < 5000) {
				sessionValue += entry.value;
			} else {
				sessionValue = entry.value;
				sessionStart = entry.startTime;
			}
			sessionLast = entry.startTime;
			cls = Math.max(cls, sessionValue);
		}
	});

	// Interaction to Next Paint: roughly the 98th percentile of interaction latencies.
	const interactions = new Map<number, number>();
	const onEventEntries = (entries: PerformanceEntry[]) => {
		for (const entry of entries as EventTimingEntry[]) {
			if (!entry.interactionId) continue;
			interactions.set(entry.interactionId, Math.max(interactions.get(entry.interactionId) ?? 0, entry.duration));
		}
	};
	observe("event", onEventEntries, { durationThreshold: 40 });
	observe("first-input", onEventEntries);
	const currentInp = (): number | null => {
		if (!interactions.size) return null;
		const sorted = [...interactions.values()].sort((a, b) => b - a);
		return sorted[Math.min(sorted.length - 1, Math.floor(interactions.size / 50))];
	};

	const onHidden = (event: Event) => {
		if (event.type === "visibilitychange" && document.visibilityState !== "hidden") return;
		finalizeLcp();
		send("CLS", cls);
		const inp = currentInp();
		if (inp !== null) send("INP", inp);
	};
	document.addEventListener("visibilitychange", onHidden, true);
	addEventListener("pagehide", onHidden, true);

	return () => {
		for (const observer of observers) observer.disconnect();
		removeEventListener("keydown", onFirstInput, true);
		removeEventListener("click", onFirstInput, true);
		document.removeEventListener("visibilitychange", onHidden, true);
		removeEventListener("pagehide", onHidden, true);
	};
}

/** Reports Core Web Vitals from a component; subscribes once per mount and always calls the latest callback. */
export function useReportWebVitals(report: (metric: WebVitalMetric) => void): void {
	const latest = useRef(report);
	latest.current = report;
	useEffect(() => observeWebVitals((metric) => latest.current(metric)), []);
}
