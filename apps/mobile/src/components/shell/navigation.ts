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

export type SidebarMove = "stay" | "replace" | "back" | "push";

/**
 * How the sidebar (or a notification) opens `href` from `pathname`, given the sections already in the app's stack
 * (`stacked`, bottom first). The launch screen (Chat, or Models when signed out) is the root and every section opens
 * over it, so back leads there and nothing is open twice:
 * - the launch screen, a section's own root, or a section already in the stack is gone back to ("back"), which
 *   closes whatever was opened over it;
 * - from the launch screen another section is pushed;
 * - from another section, the target takes its place ("replace"), as does a detail in the section showing.
 */
export function sidebarMove(pathname: string, href: string, signedIn: boolean, stacked: readonly string[] = []): SidebarMove {
  if (pathname === href) return "stay";
  const target = sectionOf(href);
  const home = launchHref(signedIn);
  // `/` is the launch screen before its redirect has run (a notification that launched the app).
  const from = pathname === "/" ? home : sectionOf(pathname);
  if (target === home) return "back";
  if (target === from) return href === target ? "back" : "replace";
  if (stacked.includes(target)) return "back";
  return from === home ? "push" : "replace";
}

/**
 * How a chat opens from the sidebar: inside Chat it takes the open chat's place, so Chat stays one screen and back
 * leaves the app; from a screen pushed over Chat, it opens the way the sidebar opens screens (back to Chat).
 */
export const chatOpens = (pathname: string): "replace" | "screen" => (sectionOf(pathname) === "/chat" ? "replace" : "screen");

type NavState = { key?: string; routes: readonly { name: string; state?: unknown }[] };

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
  if (!app?.key) return null;
  // The router only takes a complete state, so the stack keeps its own fields and gets new routes.
  return { type: "RESET", target: app.key, payload: { ...app, stale: false, index: 0, routes: [{ name: launchHref(signedIn).slice(1) }], preloadedRoutes: [] } };
}
