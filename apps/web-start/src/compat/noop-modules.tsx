// Stand-ins for Vercel/Next-only packages that have no Workers equivalent.
import type { ReactNode } from "react";

// @vercel/analytics/react — Vercel Web Analytics only runs on Vercel.
export function Analytics(_props: Record<string, unknown>) {
	return null;
}
export function track(_name: string, _properties?: Record<string, unknown>): void {}

// next-navigation-guard — unsaved-changes prompts fall back to the browser's
// own beforeunload prompt, which the guard hooks already register.
export function NavigationGuardProvider({ children }: { children?: ReactNode }) {
	return <>{children}</>;
}
export function useNavigationGuard(_options: { enabled?: boolean | (() => boolean); confirm?: () => boolean | Promise<boolean> }) {
	return { active: false, accept: () => {}, reject: () => {} };
}
