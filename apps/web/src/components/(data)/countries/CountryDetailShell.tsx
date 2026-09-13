import { ReactNode } from "react";
import Image from "next/image";

import type { CountrySummary } from "@/lib/fetchers/countries/types";
import ModelPageToc, { type ModelPageTocItem } from "@/components/(data)/model/ModelPageToc";
import EntityStickyHeader from "@/components/(data)/EntityStickyHeader";

interface CountryDetailShellProps {
	country?: CountrySummary;
	iso: string;
	children: ReactNode;
	tocItems?: ModelPageTocItem[];
}

export default function CountryDetailShell({
	country,
	iso,
	children,
	tocItems = [],
}: CountryDetailShellProps) {
	const countryName = country?.countryName ?? "Unknown country";
	const isoLabel = country?.iso ?? iso.toUpperCase();
	const flagIso = isoLabel.toLowerCase();
	const hasFlag = flagIso.length === 2;

	return (
		<main className="flex flex-col">
			<EntityStickyHeader kind="country" id={isoLabel} name={countryName} observeId="country-detail-primary-header" baseHref={`/countries/${isoLabel.toLowerCase()}`} navigation={[]} />
			<div className="container mx-auto px-4 py-8">
				<div id="country-detail-primary-header" className="mb-5 flex w-full flex-col gap-4 md:flex-row md:items-start md:justify-between">
					<div className="flex items-center gap-4">
						<div className="flex h-10 aspect-4/3 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-background md:h-16">
							{hasFlag ? (
								<Image
									src={`/flags/${flagIso}.svg`}
									alt={`${isoLabel} flag`}
									width={64}
									height={48}
									className="h-full w-full object-cover"
								/>
							) : (
								<span className="text-base font-semibold uppercase tracking-[0.35em]">
									{isoLabel}
								</span>
							)}
						</div>
						<div className="space-y-1">
							<h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground">
								{countryName}
							</h1>
							<p className="text-sm text-muted-foreground">AI organisations and models from {countryName}</p>
						</div>
					</div>
				</div>
				<div className="mt-6 min-h-full">{tocItems.length ? <div className="flex flex-col gap-6 lg:flex-row lg:items-start"><ModelPageToc items={tocItems} className="lg:h-full lg:w-40 lg:shrink-0 xl:w-44" /><div className="min-w-0 flex-1">{children}</div></div> : children}</div>
			</div>
		</main>
	);
}
