import type { OrganisationOverview as OrganisationOverviewType } from "@/lib/fetchers/organisations/types";
import { getTranslations } from "next-intl/server";
import OrganisationLinks from "./OrganisationLinks";
import ModelsDisplay from "./ModelsDisplay";
import LabPerformance from "./LabPerformance";

export interface OrganisationOverviewProps {
	organisation: OrganisationOverviewType;
}

export default async function OrganisationOverview({
	organisation,
}: OrganisationOverviewProps) {
	const t = await getTranslations("Catalogue.organisations");
	return (
		<div className="mx-auto w-full space-y-10">
			{/* Header & Description */}
			{organisation.description && (
				<section id="about" className="scroll-mt-36 space-y-2">
					<h2 className="text-xl font-semibold tracking-tight">
						{t("aboutHeading", { name: organisation.name })}
					</h2>
					<p className="max-w-3xl text-sm leading-6 text-muted-foreground">
						{organisation.description}
					</p>
				</section>
			)}

			<section id="performance" className="scroll-mt-36 space-y-4 border-t border-border/60 pt-8">
				<div className="space-y-1">
					<h2 className="text-xl font-semibold tracking-tight">{t("performanceTitle")}</h2>
					<p className="text-sm text-muted-foreground">
						{t("performanceDescription", { name: organisation.name })}
					</p>
				</div>
				<LabPerformance models={organisation.performance_models} />
			</section>

			{/* Models section */}
			<section id="latest-models" className="scroll-mt-36 space-y-4 border-t border-border/60 pt-8">
				<div className="space-y-1">
					<h2 className="text-xl font-semibold tracking-tight">{t("latestModelsTitle")}</h2>
					<p className="text-sm text-muted-foreground">
						{t("latestModelsDescription")}
					</p>
				</div>
				<ModelsDisplay
					models={[...organisation.recent_models]}
					showStatusHeadings={false}
				/>
			</section>

			{organisation.organisation_links &&
				organisation.organisation_links.length > 0 && (
					<section id="links" className="scroll-mt-36 space-y-4 border-t border-border/60 pt-8">
						<div className="space-y-1">
						<h2 className="text-xl font-semibold tracking-tight">{t("aroundWebTitle")}</h2>
						<p className="text-sm text-muted-foreground">
							{t("aroundWebDescription")}
							</p>
						</div>
						<OrganisationLinks organisation={organisation} />
					</section>
				)}
		</div>
	);
}
