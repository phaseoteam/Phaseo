// `next-navigation-guard` on TanStack Router's blocker: in-app navigations wait
// for the caller's dialog, and tab closes or reloads get the browser prompt.
import { useBlocker } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function NavigationGuardProvider({ children }: { children?: ReactNode }) {
	return <>{children}</>;
}

export function useNavigationGuard({ enabled = true }: { enabled?: boolean | (() => boolean) }) {
	const isEnabled = () => (typeof enabled === "function" ? enabled() : enabled);
	const blocker = useBlocker({ shouldBlockFn: isEnabled, enableBeforeUnload: isEnabled, withResolver: true });
	return {
		active: blocker.status === "blocked",
		accept: () => blocker.proceed?.(),
		reject: () => blocker.reset?.(),
	};
}
