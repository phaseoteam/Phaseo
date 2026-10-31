import { Outlet } from "@tanstack/react-router";
import { useTranslations } from "@/i18n/react";

export default function UpdatesLayout() {
	const t = useTranslations("Catalogue.updates");

	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto flex-1 px-4 py-4">
				<div className="mt-6 space-y-3">
					<h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50 sm:text-4xl">
						{t("heading")}
					</h1>
				</div>

				<div className="my-4"><Outlet /></div>
			</div>
		</main>
	);
}
