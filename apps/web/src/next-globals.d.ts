// Next generated these route prop helpers as globals; the shared page modules
// still annotate with them.
/* eslint-disable @typescript-eslint/no-explicit-any -- params depend on the route */
import type { ReactNode } from "react";

declare global {
	type LayoutProps<_Route extends string = string> = {
		params: Promise<any>;
		children: ReactNode;
		[slot: string]: any;
	};
	type PageProps<_Route extends string = string> = {
		params: Promise<any>;
		searchParams: Promise<Record<string, string | string[] | undefined>>;
	};
}

export {};
