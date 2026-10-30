// `next/web-vitals`: report Core Web Vitals through PerformanceObserver.
import { useEffect } from "react";

type Metric = { id: string; name: string; value: number; rating?: string; navigationType?: string };

export function useReportWebVitals(report: (metric: Metric) => void): void {
	useEffect(() => {
		if (typeof PerformanceObserver === "undefined") return;
		const observers: PerformanceObserver[] = [];
		const observe = (type: string, toMetric: (entry: PerformanceEntry) => Metric | null) => {
			try {
				const observer = new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						const metric = toMetric(entry);
						if (metric) report(metric);
					}
				});
				observer.observe({ type, buffered: true } as PerformanceObserverInit);
				observers.push(observer);
			} catch {
				// Unsupported entry type in this browser.
			}
		};
		observe("largest-contentful-paint", (entry) => ({ id: `lcp-${entry.startTime}`, name: "LCP", value: entry.startTime }));
		observe("paint", (entry) => (entry.name === "first-contentful-paint" ? { id: `fcp-${entry.startTime}`, name: "FCP", value: entry.startTime } : null));
		observe("navigation", (entry) => ({ id: "ttfb", name: "TTFB", value: (entry as PerformanceNavigationTiming).responseStart }));
		return () => {
			for (const observer of observers) observer.disconnect();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- report once per mount, like next/web-vitals
	}, []);
}
