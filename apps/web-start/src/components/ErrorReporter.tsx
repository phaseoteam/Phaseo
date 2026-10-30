"use client";

import { useEffect } from "react";

import { reportClientError } from "@/lib/clientErrorReporting";

export function ErrorReporter({ error, source }: { error: Error & { digest?: string }; source: string }) {
	useEffect(() => {
		reportClientError({
			source: "manual",
			error,
			message: error.message,
			stack: error.stack,
			fatal: true,
			handled: true,
			context: {
				boundary: source,
				digest: error.digest ?? null,
			},
		});
	}, [error, source]);

	return null;
}
