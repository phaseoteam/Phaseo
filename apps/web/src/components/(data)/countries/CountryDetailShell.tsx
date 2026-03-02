import { ReactNode } from "react";
import Image from "next/image";

import CountryTabs from "@/components/(data)/countries/CountryTabs";
import { CountrySummary } from "@/lib/fetchers/countries/getCountrySummaries";

interface CountryDetailShellProps {
	country?: CountrySummary;
	iso: string;
	children: ReactNode;
}

export default function CountryDetailShell({
	country,
	iso,
	children,
}: CountryDetailShellProps) {
	const countryName = country?.countryName ?? "Unknown country";
	const isoLabel = country?.iso ?? iso.toUpperCase();
	const flagIso = isoLabel.toLowerCase();
	const hasFlag = flagIso.length === 2;

	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8">
				<div className="mb-8 flex w-full flex-col items-center justify-between gap-4 md:flex-row md:items-start md:gap-0">
					<div className="flex items-center gap-4">
						<div className="flex h-10 aspect-4/3 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:h-16">
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
							<h1 className="text-3xl font-semibold leading-tight text-zinc-950 dark:text-zinc-50">
								{countryName}
							</h1>
						</div>
					</div>

				</div>

				<CountryTabs iso={isoLabel} />

				<div className="mt-6 min-h-full">{children}</div>
			</div>
		</main>
	);
}
