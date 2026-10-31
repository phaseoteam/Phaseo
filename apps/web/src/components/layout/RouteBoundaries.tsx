// Router-wide error and not-found screens.
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useMatch, useRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getCurrentRequest } from "@/lib/start/request-context";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "@/i18n/react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ErrorState";
import { ErrorReporter } from "@/components/ErrorReporter";

// Errors that reach a boundary while rendering on the server (loader and
// server function failures) are reported to PostHog with the visitor's consent.
// In the browser, ErrorReporter covers them.
const reportServerRenderError = createIsomorphicFn()
	.server((error: unknown, routePath: string | undefined) => {
		const request = getCurrentRequest();
		if (!request) return;
		void import("@/lib/analytics/serverErrorCapture").then(({ captureServerError }) => captureServerError(error, request, { source: "render", routePath }));
	})
	.client((_error: unknown, _routePath: string | undefined) => {});

export function RouteErrorBoundary({ error, reset }: ErrorComponentProps) {
	const router = useRouter();
	const routeId = useMatch({ strict: false, select: (match) => match.routeId });
	if (typeof window === "undefined") reportServerRenderError(error, routeId);
	return (
		<div className="flex min-h-dvh flex-none items-center justify-center px-4 py-16 sm:px-6">
			<ErrorReporter error={error as Error & { digest?: string }} source="dashboard" />
			<div className="-translate-y-16">
				<ErrorState
					error={error as Error & { digest?: string }}
					reset={() => {
						reset();
						void router.invalidate();
					}}
				/>
			</div>
		</div>
	);
}

export function RouteNotFound() {
	const locale = useLocale();
	const t = useTranslations("Common.errors");
	return (
		<main className="flex min-h-dvh items-center justify-center px-4 py-16 sm:px-6">
			<div className="text-center">
				<h1 className="text-2xl font-semibold tracking-tight">{t("notFoundTitle")}</h1>
				<p className="mt-2 text-sm text-muted-foreground">{t("notFoundDescription")}</p>
				<div className="mt-6 flex flex-wrap items-center justify-center gap-2">
					<Button asChild variant="outline">
						<Link href="/">
							<ArrowLeft className="size-4" aria-hidden="true" />
							{t("goHome")}
						</Link>
					</Button>
					<Button asChild variant="outline">
						<Link href="/models" locale={locale}>
							{t("browseModels")}
							<ArrowRight className="size-4" aria-hidden="true" />
						</Link>
					</Button>
				</div>
			</div>
		</main>
	);
}
