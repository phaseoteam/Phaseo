import type { ReactNode } from "react";

// In web-start every page already has the locale's full catalogue
// (RootIntlProvider), so route scopes pass their children through.
export type ScopedLayoutProps = {
	children: ReactNode;
	params?: Promise<{ locale: string }>;
};

export function ScopedMessages({ children }: ScopedLayoutProps & { namespaces?: readonly string[] }) {
	return <>{children}</>;
}

export function createScopedMessagesLayout(_namespaces: readonly string[]) {
	return function ScopedMessagesLayout({ children }: ScopedLayoutProps) {
		return <>{children}</>;
	};
}

export function createScopedMessagesTemplate(_namespaces: readonly string[]) {
	return function ScopedMessagesTemplate({ children }: { children: ReactNode }) {
		return <>{children}</>;
	};
}
