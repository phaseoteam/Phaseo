import { useEffect, useRef, useState } from "react";
import { createBrowserTab, ensureBrowserTab, listBrowserTabs, selectBrowserTab, useBrowserTabs } from "../lib/browserTabs";
import { BrowserSurface } from "./BrowserSurface";

export { BrowserSurface };

/**
 * The chat's selected browser tab, for a pane that shows the browser as a single surface. Panes that give each browser
 * tab its own pane tab render BrowserSurface directly with the tabs from lib/browserTabs.
 */
export function BrowserPanel({ context, covered, requestedLink }: { context: string; covered: boolean; requestedLink?: { url: string; request: number } }) {
	const tabs = useBrowserTabs(context);
	const active = tabs.find(tab => tab.active);
	useEffect(() => { if (!active) ensureBrowserTab(context); }, [active, context]);
	// A link from the chat selects the tab showing it, fills a blank tab, or opens a new one.
	const lastLink = useRef<number | undefined>(undefined);
	const [forActive, setForActive] = useState<{ url: string; request: number }>();
	useEffect(() => {
		if (!requestedLink || requestedLink.request === lastLink.current) return;
		lastLink.current = requestedLink.request;
		const current = listBrowserTabs(context);
		const existing = current.find(tab => tab.url === requestedLink.url), selected = current.find(tab => tab.active);
		if (existing) selectBrowserTab(context, existing.id);
		else if (selected && !selected.url) setForActive(requestedLink);
		else try { createBrowserTab(context, { url: requestedLink.url }); } catch { /* At the tab limit the link stays in the chat. */ }
	}, [context, requestedLink]);
	return active ? <BrowserSurface key={active.id} context={context} tabId={active.id} covered={covered} requestedLink={forActive} /> : null;
}
