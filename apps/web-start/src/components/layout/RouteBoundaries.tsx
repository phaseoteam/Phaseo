// Router-wide error and not-found screens (Next: app/[locale]/(dashboard)/error.tsx
// and app/[locale]/not-found.tsx).
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ErrorState";
import { ErrorReporter } from "@/components/ErrorReporter";

export function RouteErrorBoundary({ error, reset }: ErrorComponentProps) {
	const router = useRouter();
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
