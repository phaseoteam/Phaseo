import { Card, CardContent } from "@/components/ui/card";
import type { CountryOrganisationSummary } from "@/lib/fetchers/countries/types";
import { Logo } from "@/components/Logo";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface CountryOrganisationCardProps {
	organisation: CountryOrganisationSummary;
}

export default function CountryOrganisationCard({
	organisation,
}: CountryOrganisationCardProps) {
	const organisationPath = `/organisations/${organisation.organisation_id}`;

	return (
		<Link href={organisationPath} className="group block h-full">
			<Card
				className="h-full gap-0 rounded-md border border-border/70 bg-card/30 py-0 shadow-none transition-colors group-hover:bg-muted/25"
			>
				<CardContent className="flex items-center gap-3 p-3">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background">
							<Logo
								id={organisation.organisation_id}
								alt={
									organisation.organisation_name ??
									"Organisation logo"
								}
								width={26}
								height={26}
								className="object-contain"
							/>
					</div>
					<div className="min-w-0 flex-1">
						<span className="block truncate font-semibold leading-tight text-foreground underline decoration-transparent underline-offset-2 group-hover:decoration-current">
									{organisation.organisation_name ??
										organisation.organisation_id}
						</span>
							<p className="text-xs text-muted-foreground">
								{organisation.modelCount} model
								{organisation.modelCount === 1 ? "" : "s"}
							</p>
					</div>
					<ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
				</CardContent>
			</Card>
		</Link>
	);
}
