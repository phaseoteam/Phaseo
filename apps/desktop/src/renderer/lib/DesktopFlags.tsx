import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { StatsigClient } from "@statsig/js-client";

const defaults = { browserSuggestions: true };
const FlagsContext = createContext(defaults);
let initialization: Promise<typeof defaults> | undefined;
export async function loadDesktopFlags() {
	const key = import.meta.env.VITE_STATSIG_CLIENT_KEY?.trim();
	if (!key?.startsWith("client-")) return defaults;
	let id: string;
	try { id = localStorage.getItem("phaseo.desktop.flags.id") || crypto.randomUUID(); localStorage.setItem("phaseo.desktop.flags.id", id); }
	catch { id = crypto.randomUUID(); }
	const client = new StatsigClient(key, { userID: id, custom: { product: "desktop" } }, {
		environment: { tier: import.meta.env.MODE }, loggingEnabled: "disabled", includeCurrentPageUrlWithEvents: false,
		networkConfig: { initializeUrl: "https://featuregates.org/v1/initialize", initializeFallbackUrls: [] },
	});
	window.addEventListener("beforeunload", () => { void client.shutdown().catch(() => {}); }, { once: true });
	await client.initializeAsync({ timeoutMs: 2000 });
	const gate = client.getFeatureGate("desktop_browser_suggestions");
	return gate.details.reason.endsWith(":Recognized") ? { browserSuggestions: gate.value } : defaults;
}
export function DesktopFlags({ children }: { children: ReactNode }) {
	const [flags, setFlags] = useState(defaults);
	useEffect(() => {
		let active = true;
		// One initialization per renderer, including React's StrictMode remount.
		initialization ??= loadDesktopFlags().catch(() => defaults);
		void initialization.then(next => { if (active) setFlags(next); });
		return () => { active = false; };
	}, []);
	return <FlagsContext.Provider value={flags}>{children}</FlagsContext.Provider>;
}
export function useDesktopFlags() { return useContext(FlagsContext); }
