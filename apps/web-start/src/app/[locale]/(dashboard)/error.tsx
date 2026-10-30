"use client";

import { ErrorState } from "@/components/ErrorState";
import { ErrorReporter } from "@/components/ErrorReporter";

export default function DashboardError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<div className="flex min-h-dvh flex-none items-center justify-center px-4 py-16 sm:px-6">
			<ErrorReporter error={error} source="dashboard" />
			<div className="-translate-y-16">
				<ErrorState error={error} reset={reset} />
			</div>
		</div>
	);
}
