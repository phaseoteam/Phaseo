/** @jest-environment jsdom */
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ANALYTICS_CONSENT_EVENT } from "@/lib/cookieConsent";
import { useModelsLayoutExperiment } from "./useModelsLayoutExperiment";

let consent = false;
const logEvent = jest.fn();
const captureProductEvent = jest.fn();

jest.mock("@/lib/clientErrorReporting", () => ({ isAnalyticsCaptureAllowed: () => consent }));
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

		consent = true;
		await act(async () => { window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: "accepted" })); });

		expect(logEvent).toHaveBeenCalledTimes(1);
		expect(logEvent.mock.calls[0][0]).toBe("models_layout_first_rows");
		expect(logEvent.mock.calls[0][1]).toBe(120);
		expect(captureProductEvent).toHaveBeenCalledWith("models_layout_first_rows", expect.objectContaining({ variant: "list" }));
	} finally {
		act(() => root.unmount());
	}
});
