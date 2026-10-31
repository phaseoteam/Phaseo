import { useTranslations } from "@/i18n/react";

export default function GatewayLoading() {
	const t = useTranslations("Product.gateway");
	return (
		<div className="container mx-auto px-4 py-12">
			<span className="sr-only">{t("loading")}</span>
			<div className="space-y-6">
				<div className="h-12 w-2/3 animate-pulse rounded bg-muted" />
				<div className="h-28 animate-pulse rounded-xl bg-muted" />
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
					<div className="h-56 animate-pulse rounded-xl bg-muted" />
					<div className="h-56 animate-pulse rounded-xl bg-muted" />
					<div className="h-56 animate-pulse rounded-xl bg-muted" />
				</div>
			</div>
		</div>
	);
}
