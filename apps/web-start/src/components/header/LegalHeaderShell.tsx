"use client";

import type { ReactNode } from "react";

type LegalHeaderShellProps = {
	children: ReactNode;
};

export default function LegalHeaderShell({ children }: LegalHeaderShellProps) {
	return (
		<div
			className="h-10 w-full max-w-full px-4 lg:px-5 xl:px-6"
			data-variant="legal-compact"
		>
			<div className="flex h-full items-center">{children}</div>
		</div>
	);
}
