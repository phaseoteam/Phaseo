import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function GetStartedSection() {
	const t = useTranslations("SettingsUI");
	return (
		<section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
			<div className="mx-auto max-w-2xl space-y-4 text-center">
				<p className="text-sm uppercase tracking-[0.4em] text-slate-500 dark:text-slate-300">
					{t("landingGaps.readyGateway")}</p>
				<h2 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
					{t("landingGaps.startTitle")}</h2>
				<p className="text-sm text-slate-600 dark:text-slate-400">
					{t("landingGaps.startHelp")}</p>
				<div className="flex flex-wrap justify-center gap-3">
					<Button asChild size="lg">
						<Link href="/sign-up">{t("landingGaps.getStarted")}</Link>
					</Button>
					<Button asChild variant="outline" size="lg">
						<Link
							href="https://github.com/phaseoteam/Phaseo"
							target="_blank"
							rel="noreferrer"
						>
							{t("landingGaps.viewCode")}</Link>
					</Button>
				</div>
			</div>
		</section>
	);
}
