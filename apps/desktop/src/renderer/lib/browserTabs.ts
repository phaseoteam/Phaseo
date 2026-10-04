import { browserUrl, type BrowserState } from "../../shared/browser";
export type BrowserTab = { id: string; title: string; url: string };
export type BrowserTabs = { active: string; tabs: BrowserTab[] };
export function browserTabs(value: unknown, context: string): BrowserTabs {
 const fallback = { active: context, tabs: [{ id: context, title: "New tab", url: "" }] };
 if (!value || typeof value !== "object" || !("tabs" in value) || !Array.isArray(value.tabs)) return fallback;
 const tabs: BrowserTab[] = [];
 for (const item of value.tabs.slice(0,20)) {
  if (!item || typeof item !== "object" || typeof item.id !== "string" || item.id.length > 200 || (item.id !== context && !item.id.startsWith(context + ":")) || tabs.some(tab => tab.id === item.id)) continue;
  let url = ""; try { if (typeof item.url === "string" && item.url) url = browserUrl(item.url); } catch { /* Discard invalid persisted addresses. */ }
  tabs.push({ id: item.id, title: typeof item.title === "string" ? item.title.slice(0,120) : "New tab", url });
 }
 if (!tabs.length) return fallback;
 return { tabs, active: "active" in value && tabs.some(tab => tab.id === value.active) ? String(value.active) : tabs[0].id };
}
export function updateBrowserTab(group: BrowserTabs, state: BrowserState): BrowserTabs {
 return { ...group, tabs: group.tabs.map(tab => tab.id === state.id ? { id: tab.id, url: state.url || (state.loading ? tab.url : ""), title: state.title || state.url || (state.loading ? tab.title : "New tab") } : tab) };
}
