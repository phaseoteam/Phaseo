"use client";

import type { CSSProperties, ReactNode } from "react";

type HeaderShellProps = {
	children: ReactNode;
};

export default function HeaderShell({ children }: HeaderShellProps) {
	const headerVars: CSSProperties & Record<string, string> = {
		"--site-header-height": "3.75rem",
		"--site-header-gap": "1.5rem",
		"--site-header-left-gap": "1.25rem",
		"--site-header-logo-height": "2.3rem",
		"--site-header-divider-height": "1.5rem",
		"--site-header-control-h": "2.25rem",
		"--site-header-nav-px": "0.5rem",
		"--site-header-search-width": "10.75rem",
		"--site-header-search-width-xl": "12rem",
	};

	return (
		<div
			className="w-full max-w-full px-4 lg:px-5 xl:px-6"
			style={headerVars}
			data-variant="full-width"
		>
			{children}
		</div>
	);
}

