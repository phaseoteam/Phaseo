import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { CountryListSummary } from "@/lib/fetchers/countries/types";

export default function CountryCard({ country }: { country: CountryListSummary }) {
	const isoLower = country.iso?.toLowerCase() ?? "";
	const hasFlag = isoLower.length === 2;
	const flagPath = hasFlag ? `/flags/${isoLower}.svg` : null;

	return (
		<Link href={`/countries/${isoLower}`} className="group block h-full">
			<Card className="h-full gap-0 rounded-md border border-border/70 bg-card/30 py-0 shadow-none transition-colors group-hover:bg-muted/25">
				<CardContent className="flex items-center gap-3 p-3">
					<div className="relative flex h-10 aspect-4/3 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-background">
						{flagPath ? (
							<Image
								src={flagPath}
								alt={`${country.countryName} flag`}
								width={44}
								height={33}
								className="h-full w-full object-cover"
							/>
						) : (
							<span className="text-sm font-semibold">
								{country.iso || "??"}
							</span>
						)}
					</div>
				<div className="flex flex-col min-w-0 flex-1">
					<span className="truncate font-semibold leading-tight underline decoration-transparent underline-offset-2 group-hover:decoration-current">
						{country.countryName}
					</span>
					<p className="mt-1 text-xs text-muted-foreground">
						{country.iso}
					</p>
				</div>
					<ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
				</CardContent>
			</Card>
		</Link>
	);
}
