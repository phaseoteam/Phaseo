"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CountrySummary } from "@/lib/fetchers/countries/getCountrySummaries";

export default function CountryCard({ country }: { country: CountrySummary }) {
	const isoLower = country.iso?.toLowerCase() ?? "";
	const hasFlag = isoLower.length === 2;
	const flagPath = hasFlag ? `/flags/${isoLower}.svg` : null;

	return (
		<Card className="flex h-full flex-col rounded-2xl border border-zinc-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800/80 dark:bg-zinc-950">
			<CardContent className="flex flex-row items-center gap-3 p-4">
				<Link href={`/countries/${isoLower}`} className="group">
					<div className="relative flex h-12 aspect-4/3 items-center justify-center rounded-xl border border-zinc-200 bg-white shadow-inner dark:border-zinc-800 dark:bg-zinc-900 p-1">
						{flagPath ? (
							<Image
								src={flagPath}
								alt={`${country.countryName} flag`}
								width={44}
								height={33}
								className="h-full w-full rounded-md object-cover"
							/>
						) : (
							<span className="text-sm font-semibold">
								{country.iso || "??"}
							</span>
						)}
					</div>
				</Link>
				<div className="flex flex-col min-w-0 flex-1">
					<Link
						href={`/countries/${isoLower}`}
						className="font-semibold truncate leading-tight"
					>
						<span className="relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
							{country.countryName}
						</span>
					</Link>
					<p className="mt-1 text-xs text-muted-foreground uppercase tracking-[0.25em]">
						{country.iso}
					</p>
				</div>
				<div className="ml-auto flex items-center gap-1">
					<Button
						asChild
						size="icon"
						variant="ghost"
						tabIndex={-1}
						className="group"
					>
						<Link
							href={`/countries/${isoLower}`}
							aria-label={`Go to ${country.countryName} details`}
							tabIndex={-1}
						>
							<ArrowRight className="w-5 h-5 transition-colors group-hover:text-primary" />
						</Link>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
