import { getTranslations } from "next-intl/server";

export default async function ByokProviderLoading() {
	const t = await getTranslations("SettingsUI.labels");
	return (
		<div className="mx-auto animate-pulse space-y-8" aria-label={t("loading")}>
			<div className="space-y-5">
				<div className="h-5 w-36 rounded-md bg-muted" />
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<div className="h-10 w-10 rounded-lg bg-muted" />
						<div className="h-7 w-32 rounded-md bg-muted" />
					</div>
					<div className="h-9 w-44 rounded-lg bg-muted" />
				</div>
			</div>
			<div className="space-y-6">
				<div className="space-y-2">
					<div className="h-5 w-28 rounded-md bg-muted" />
					<div className="h-4 w-80 max-w-full rounded-md bg-muted" />
				</div>
				{[0, 1].map((section) => (
					<div key={section} className="space-y-3">
						<div className="flex items-center justify-between">
							<div className="space-y-2">
								<div className="h-5 w-24 rounded-md bg-muted" />
								<div className="h-4 w-72 max-w-full rounded-md bg-muted" />
							</div>
							<div className="h-8 w-20 rounded-lg bg-muted" />
						</div>
						<div className="h-24 rounded-xl border border-dashed bg-muted/20" />
					</div>
				))}
			</div>
		</div>
	);
}
