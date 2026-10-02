"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ErrorReporter } from "@/components/ErrorReporter";
import { Button } from "@/components/ui/button";

export default function LocaleError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const t = useTranslations("Common.errors");

	useEffect(() => {
		// eslint-disable-next-line no-console
		console.error(error);
	}, [error]);

	return (
		<main className="flex min-h-dvh items-center justify-center px-4 py-16 sm:px-6">
			<ErrorReporter error={error} source="localized" />
			<div className="max-w-md text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					{t("unexpectedTitle")}
				</h1>
				<p className="mt-3 text-sm leading-6 text-muted-foreground">
					{t("unexpectedDescription")}
				</p>
				<Button className="mt-6" onClick={reset}>
					{t("tryAgain")}
				</Button>
			</div>
		</main>
	);
}
