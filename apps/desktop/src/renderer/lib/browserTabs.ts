import { browserUrl, browserViewport, type BrowserViewport, type BrowserState, type BrowserOpenTab } from "../../shared/browser";
export type BrowserTab = { id: string; title: string; url: string; viewport: BrowserViewport };
export type BrowserTabs = { active: string; tabs: BrowserTab[] };
export function browserTabs(value: unknown, context: string): BrowserTabs {
 const fallback = { active: context, tabs: [{ id: context, title: "New tab", url: "", viewport: "desktop" as const }] };
 if (!value || typeof value !== "object" || !("tabs" in value) || !Array.isArray(value.tabs)) return fallback;
 const tabs: BrowserTab[] = [];
 for (const item of value.tabs.slice(0,20)) {
  if (!item || typeof item !== "object" || typeof item.id !== "string" || item.id.length > 200 || (item.id !== context && !item.id.startsWith(context + ":")) || tabs.some(tab => tab.id === item.id)) continue;
  let url = ""; try { if (typeof item.url === "string" && item.url) url = browserUrl(item.url); } catch { /* Discard invalid persisted addresses. */ }
  let viewport: BrowserViewport = "desktop"; try { viewport = browserViewport(item.viewport); } catch { /* Recover old or invalid stored preview modes. */ }
  tabs.push({ viewport, id: item.id, title: typeof item.title === "string" ? item.title.slice(0,120) : "New tab", url });
 }
 if (!tabs.length) return fallback;
 return { tabs, active: "active" in value && tabs.some(tab => tab.id === value.active) ? String(value.active) : tabs[0].id };
}
export function updateBrowserTab(group: BrowserTabs, state: BrowserState): BrowserTabs {
 return { ...group, tabs: group.tabs.map(tab => tab.id === state.id ? { id: tab.id, viewport: state.viewport, url: state.url || (state.loading ? tab.url : ""), title: state.title || state.url || (state.loading ? tab.title : "New tab") } : tab) };
}

export function openBrowserTab(group: BrowserTabs, request: BrowserOpenTab, id: string): BrowserTabs {
 if (!group.tabs.some(tab => tab.id === request.sourceId)) return group;
 if (group.tabs.length >= 20) throw new Error("Close a browser tab before opening another.");
 const url = browserUrl(request.url);
 return { active: request.background ? group.active : id, tabs: [...group.tabs, { id, title: url, url, viewport: "desktop" }] };
}
