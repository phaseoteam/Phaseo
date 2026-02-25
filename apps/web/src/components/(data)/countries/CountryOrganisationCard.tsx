import { Card, CardContent } from "@/components/ui/card";
import { CountryOrganisationSummary } from "@/lib/fetchers/countries/getCountrySummaries";
import { Logo } from "@/components/Logo";
import Link from "next/link";
import { formatCountryDate } from "@/components/(data)/countries/utils";
import { ArrowRight } from "lucide-react";

interface CountryOrganisationCardProps {
	organisation: CountryOrganisationSummary;
}

export default function CountryOrganisationCard({
	organisation,
}: CountryOrganisationCardProps) {
	const topModels = organisation.models.slice(0, 3);
	const organisationPath = `/organisations/${organisation.organisation_id}`;
	const cardBorder =
		organisation.colour && organisation.colour.startsWith("#")
			? `${organisation.colour}`
			: organisation.colour ?? undefined;

	return (
		<Card
			className="relative border-2 border-zinc-200/80 bg-white/90 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800/80 dark:bg-zinc-950/90"
			style={{ borderColor: cardBorder ?? undefined }}
		>
			<CardContent className="relative space-y-4 p-4">
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<Link
							href={organisationPath}
							className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-white transition hover:opacity-90 dark:border-zinc-800 dark:bg-zinc-900"
						>
							<Logo
								id={organisation.organisation_id}
								alt={
									organisation.organisation_name ??
									"Organisation logo"
								}
								width={34}
								height={34}
								className="object-contain"
							/>
						</Link>
						<div className="min-w-0">
							<Link
								href={organisationPath}
								className="font-semibold leading-tight text-zinc-950 hover:text-primary dark:text-zinc-50"
							>
								<span className="relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
									{organisation.organisation_name ??
										organisation.organisation_id}
								</span>
							</Link>
							<p className="text-xs text-muted-foreground">
								{organisation.modelCount} model
								{organisation.modelCount === 1 ? "" : "s"}
							</p>
						</div>
					</div>
				</div>

				{topModels.length ? (
					<ul className="space-y-2 text-sm">
						{topModels.map((model) => (
							<li
								key={model.model_id}
								className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200/80 bg-white px-3 py-2 text-sm dark:border-zinc-800/80 dark:bg-zinc-900"
							>
								<div className="min-w-0">
									<Link
										href={`/models/${model.model_id}`}
										className="font-semibold leading-tight text-zinc-950 hover:text-primary dark:text-zinc-50"
									>
										<span className="relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
											{model.name}
										</span>
									</Link>
									<p className="text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
										{formatCountryDate(model.primary_date)}
									</p>
								</div>
								<Link
									href={`/models/${model.model_id}`}
									className="group flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-primary/10"
									aria-label={`View ${model.name}`}
									style={
										{
											"--hover-color":
												cardBorder ?? "currentColor",
										} as React.CSSProperties
									}
								>
									<ArrowRight className="h-4 w-4 transition-colors group-hover:text-[var(--hover-color)]" />
								</Link>
							</li>
						))}
					</ul>
				) : (
					<p className="text-xs text-muted-foreground">
						No models mapped yet.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
