/** @jest-environment jsdom */
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useModelsLayoutExperiment } from "./useModelsLayoutExperiment";

let consent: "accepted" | "denied" | null = null;
const logEvent = jest.fn();
const captureProductEvent = jest.fn();

jest.mock("@/lib/clientErrorReporting", () => ({ isAnalyticsCaptureAllowed: () => consent === "accepted" }));
jest.mock("@/lib/cookieConsent", () => ({ ANALYTICS_CONSENT_EVENT: "phaseo:analytics-consent", readAnalyticsConsent: () => consent }));
jest.mock("@/lib/productAnalytics", () => ({ captureProductEvent: (...args: unknown[]) => captureProductEvent(...args) }));
jest.mock("@/lib/statsig/shared", () => ({
	buildAnonymousStatsigUser: (stableID: string) => ({ customIDs: { stableID } }),
	readStableIdCookie: () => "stable-1",
	writeStableIdCookie: () => {},
}));
jest.mock("next/web-vitals", () => ({ useReportWebVitals: () => {} }));
jest.mock("@statsig/js-client", () => ({
	StatsigClient: class {
		initializeSync() { return { source: "Cache" }; }
		getExperiment() { return { groupName: "List", value: { layout: "list" } }; }
		updateRuntimeOptions() {}
		updateUserAsync() { return Promise.resolve({ success: true }); }
		logEvent(...args: unknown[]) { logEvent(...args); }
		shutdown() { return Promise.resolve(); }
	},
}));

function Probe() {
	const { ready, track } = useModelsLayoutExperiment(true);
	useEffect(() => {
		if (ready) track("models_layout_first_rows", { value: 120 });
	}, [ready, track]);
	return null;
}

it("sends events tracked before consent once the visitor accepts on the same page", async () => {
	process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY = "client-test";
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	Object.defineProperty(performance, "getEntriesByType", { configurable: true, value: () => [] });
	const node = document.createElement("div");
	const root = createRoot(node);
	try {
		await act(async () => root.render(<Probe />));
		await act(async () => { await Promise.resolve(); });
		expect(logEvent).not.toHaveBeenCalled();

		consent = "accepted";
		await act(async () => { window.dispatchEvent(new CustomEvent("phaseo:analytics-consent", { detail: consent })); });

		expect(logEvent).toHaveBeenCalledTimes(1);
		expect(logEvent.mock.calls[0][0]).toBe("models_layout_first_rows");
		expect(logEvent.mock.calls[0][1]).toBe(120);
		expect(captureProductEvent).toHaveBeenCalledWith("models_layout_first_rows", expect.objectContaining({ variant: "list" }));
	} finally {
		act(() => root.unmount());
	}
});

it("discards events from before a decline even if the visitor accepts later", async () => {
	consent = null;
	logEvent.mockClear();
	const node = document.createElement("div");
	const root = createRoot(node);
	try {
		await act(async () => root.render(<Probe />));
		await act(async () => { await Promise.resolve(); });
		consent = "denied";
		await act(async () => { window.dispatchEvent(new CustomEvent("phaseo:analytics-consent", { detail: consent })); });
		consent = "accepted";
		await act(async () => { window.dispatchEvent(new CustomEvent("phaseo:analytics-consent", { detail: consent })); });
		expect(logEvent).not.toHaveBeenCalled();
	} finally {
		act(() => root.unmount());
	}
});
