import { getTranslations } from "next-intl/server";

export default async function AppsLoading() {
	const t = await getTranslations("Product.apps");
	return (
		<div className="container mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			<span className="sr-only">{t("loading")}</span>
			<div className="space-y-6">
				<div className="h-10 w-72 animate-pulse rounded bg-muted" />
				<div className="h-64 animate-pulse rounded-xl bg-muted" />
				<div className="h-80 animate-pulse rounded-xl bg-muted" />
			</div>
		</div>
	);
}
