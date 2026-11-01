import { Bot, ChartNoAxesColumn, Columns3, Server, type LucideIcon } from "lucide-react-native";

/** Where the app opens, and where `/` redirects: a new chat when signed in, the public Models catalogue when not. */
export const launchHref = (signedIn: boolean) => (signedIn ? "/chat" : "/models");

export type SidebarItem = { href: "/models" | "/compare" | "/providers" | "/account/usage"; label: string; icon: LucideIcon };

const MODELS: SidebarItem = { href: "/models", label: "Models", icon: Bot };
const COMPARE: SidebarItem = { href: "/compare", label: "Compare", icon: Columns3 };
const PROVIDERS: SidebarItem = { href: "/providers", label: "Providers", icon: Server };
const USAGE: SidebarItem = { href: "/account/usage", label: "Usage", icon: ChartNoAxesColumn };

/** The short list at the foot of the sidebar. Phones reach Compare from a model; Usage needs an account. */
export function sidebarItems({ split, signedIn }: { split: boolean; signedIn: boolean }): SidebarItem[] {
  return [MODELS, ...(split ? [COMPARE] : []), PROVIDERS, ...(signedIn ? [USAGE] : [])];
}

/** The first path segment: `/models/openai/gpt-5` is in `/models`. */
export const sectionOf = (path: string) => `/${path.split(/[/?#]/)[1] ?? ""}`;

/** Opens as a section of its own: a section's root, or Usage, which lives in Account but has its own sidebar row. */
export const opensAsSection = (href: string) => href === sectionOf(href) || href === "/account/usage";

/** The app group's sections. Anything else (signing in, pairing, a sheet) opens over the app rather than inside it. */
const APP_SECTIONS = ["/chat", "/models", "/providers", "/compare", "/account", "/code"];
export const inApp = (path: string) => path === "/" || APP_SECTIONS.includes(sectionOf(path));

/** The sidebar's destinations. Compare opens over a model on phones, so it keeps back. */
const DESTINATIONS = ["/chat", "/models", "/providers", "/account", "/code"];

/**
 * Whether a phone screen leads with the sidebar rather than back: a destination's root at the bottom of its own stack
 * (`depth` 0), as the sidebar opens it. Those show the sidebar button and open the drawer from a drag anywhere, edge
 * included. Everything else is a detail (a provider opened from a model, or Usage over Account's list): back on the
 * left and the edge swipe for back, and a drag that starts away from the edge opens the drawer. Chat stays one
 * screen, so all of it leads with the sidebar.
 */
export function leadsWithSidebar(pathname: string, depth: number) {
  const section = sectionOf(pathname);
  return pathname === "/" || section === "/chat" || (DESTINATIONS.includes(section) && opensAsSection(pathname) && depth === 0);
}

export type SidebarMove = "stay" | "back" | "push" | "switch" | "replace";

/**
 * How the sidebar (or a notification) opens `href` from `pathname`, given the sections already in the app's stack
 * (`stacked`, bottom first). The launch screen (Chat, or Models when signed out) is the root with at most one section
 * over it, so back unwinds the section, then returns to the launch screen, then leaves the app:
 * - the launch screen is gone back to ("back"), which closes whatever was open over it;
 * - from the launch screen, the target is pushed over it;
 * - from a section, a section (another, or the same one) is switched to at its root ("switch", see sectionSwitch);
 * - a detail in a section already under the current one is gone back to; any other detail takes the current screen's
 *   place ("replace"), with its section's root under it.
 */
export function sidebarMove(pathname: string, href: string, signedIn: boolean, stacked: readonly string[] = []): SidebarMove {
  if (pathname === href) return "stay";
  const target = sectionOf(href);
  const home = launchHref(signedIn);
  // `/` is the launch screen before its redirect has run (a notification that launched the app).
  const from = pathname === "/" ? home : sectionOf(pathname);
  if (target === home) return "back";
  if (from === home) return "push";
  if (opensAsSection(href)) return "switch";
  if (target !== from && stacked.includes(target)) return "back";
  return "replace";
}

/**
 * How a chat opens from the sidebar: inside Chat it takes the open chat's place, so Chat stays one screen and back
 * leaves the app; from a section, it opens the way the sidebar opens screens (back to Chat).
 */
export const chatOpens = (pathname: string): "replace" | "screen" => (sectionOf(pathname) === "/chat" ? "replace" : "screen");

type NavRoute = { name: string; state?: unknown };
type NavState = { key?: string; index?: number; routes: readonly NavRoute[] };

/** The sections in the app's stack, bottom first (`/chat`, `/models`…), for sidebarMove; empty before it has mounted. */
export function stackedSections(root: NavState | undefined): string[] {
  return (findStack(root, "(app)")?.routes ?? []).map((route) => (route.name === "index" ? "/" : `/${route.name}`));
}

function findStack(state: NavState | undefined, name: string): NavState | undefined {
  for (const route of state?.routes ?? []) {
    const child = route.state as NavState | undefined;
    if (route.name === name) return child;
    const found = findStack(child, name);
    if (found) return found;
  }
  return undefined;
}

/**
 * Signing in or out starts the app's stack again on the launch screen alone, so back can't return to the other layout
 * (a signed-in Models with no chat under it, or a chat after signing out). Null before the stack has mounted.
 */
export function launchReset(root: NavState | undefined, signedIn: boolean) {
  const app = findStack(root, "(app)");
  return app?.key ? resetApp(app, app.key, [{ name: launchHref(signedIn).slice(1) }]) : null;
}

/**
 * Switching section from the sidebar: the app's stack becomes the launch screen (kept as it was, so the open chat
 * stays) with the section over it at its root, closing whatever else was open. Usage opens alone in Account's stack,
 * as its own section. Null before the stack has mounted.
 */
export function sectionSwitch(root: NavState | undefined, href: string, signedIn: boolean) {
  const app = findStack(root, "(app)");
  if (!app?.key) return null;
  const launch = launchHref(signedIn).slice(1);
  // `index` is the launch screen before its redirect has run.
  const homeAt = app.routes.findLastIndex((route) => route.name === launch || route.name === "index");
  const home = homeAt >= 0 ? app.routes.slice(0, homeAt + 1) : [{ name: launch }];
  const section = sectionOf(href);
  const screen = href.slice(section.length + 1);
  // A partial nested state: the section's stack fills in the rest when it mounts.
  const route = screen ? { name: section.slice(1), state: { routes: [{ name: screen }] } } : { name: section.slice(1) };
  return resetApp(app, app.key, [...home, route]);
}

// The router only takes a complete state, so the stack keeps its own fields and gets new routes.
const resetApp = (app: NavState, target: string, routes: readonly NavRoute[]) =>
  ({ type: "RESET", target, payload: { ...app, stale: false, index: routes.length - 1, routes, preloadedRoutes: [] } });

/** How deep the open section's own stack is: 0 at its root (Models, the Code list), 1 for a detail over it. */
export function sectionDepth(root: NavState | undefined) {
  const app = findStack(root, "(app)");
  const top = app?.routes[app.index ?? app.routes.length - 1]?.state as NavState | undefined;
  return top ? top.index ?? top.routes.length - 1 : 0;
}
