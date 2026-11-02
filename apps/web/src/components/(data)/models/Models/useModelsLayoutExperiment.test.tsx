// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useModelsLayoutExperiment } from "./useModelsLayoutExperiment";

const mocks = vi.hoisted(() => ({
	consent: null as "accepted" | "denied" | null,
	logEvent: vi.fn(),
	captureProductEvent: vi.fn(),
}));

vi.mock("@/lib/clientErrorReporting", () => ({ isAnalyticsCaptureAllowed: () => mocks.consent === "accepted" }));
vi.mock("@/lib/cookieConsent", () => ({ ANALYTICS_CONSENT_EVENT: "phaseo:analytics-consent", readAnalyticsConsent: () => mocks.consent }));
vi.mock("@/lib/productAnalytics", () => ({ captureProductEvent: (...args: unknown[]) => mocks.captureProductEvent(...args) }));
vi.mock("@/lib/statsig/shared", () => ({
	buildAnonymousStatsigUser: (stableID: string) => ({ customIDs: { stableID } }),
	readStableIdCookie: () => "stable-1",
	writeStableIdCookie: () => {},
}));
vi.mock("@/lib/analytics/webVitals", () => ({ useReportWebVitals: () => {} }));
vi.mock("@statsig/js-client", () => ({
	StatsigClient: class {
		initializeSync() { return { source: "Cache" }; }
		getExperiment() { return { groupName: "List", value: { layout: "list" } }; }
		updateRuntimeOptions() {}
		updateUserAsync() { return Promise.resolve({ success: true }); }
		logEvent(...args: unknown[]) { mocks.logEvent(...args); }
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
	process.env.PUBLIC_STATSIG_CLIENT_KEY = "client-test";
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	Object.defineProperty(performance, "getEntriesByType", { configurable: true, value: () => [] });
	const node = document.createElement("div");
	const root = createRoot(node);
	try {
		await act(async () => root.render(<Probe />));
		await act(async () => { await Promise.resolve(); });
		expect(mocks.logEvent).not.toHaveBeenCalled();

		mocks.consent = "accepted";
		await act(async () => { window.dispatchEvent(new CustomEvent("phaseo:analytics-consent", { detail: mocks.consent })); });

		expect(mocks.logEvent).toHaveBeenCalledTimes(1);
		expect(mocks.logEvent.mock.calls[0][0]).toBe("models_layout_first_rows");
		expect(mocks.logEvent.mock.calls[0][1]).toBe(120);
		expect(mocks.captureProductEvent).toHaveBeenCalledWith("models_layout_first_rows", expect.objectContaining({ variant: "list" }));
	} finally {
		act(() => root.unmount());
	}
});

it("discards events from before a decline even if the visitor accepts later", async () => {
	mocks.consent = null;
	mocks.logEvent.mockClear();
	const node = document.createElement("div");
	const root = createRoot(node);
	try {
		await act(async () => root.render(<Probe />));
		await act(async () => { await Promise.resolve(); });
		mocks.consent = "denied";
		await act(async () => { window.dispatchEvent(new CustomEvent("phaseo:analytics-consent", { detail: mocks.consent })); });
		mocks.consent = "accepted";
		await act(async () => { window.dispatchEvent(new CustomEvent("phaseo:analytics-consent", { detail: mocks.consent })); });
		expect(mocks.logEvent).not.toHaveBeenCalled();
	} finally {
		act(() => root.unmount());
	}
});
