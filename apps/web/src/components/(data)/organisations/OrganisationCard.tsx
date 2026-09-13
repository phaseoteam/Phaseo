import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { OrganisationCard as OrganisationTypeCard } from "@/lib/fetchers/organisations/getAllOrganisations";
import Image from "next/image";
import { Logo } from "@/components/Logo";
import { formatLocation } from "@/lib/locations";

export default function OrganisationCard({
	organisation,
}: {
	// organisation: OrganisationCard;
	organisation: OrganisationTypeCard;
}) {
	return (
		<Card
			style={{ borderColor: organisation.colour || undefined }}
			className={cn(
				"relative flex h-full flex-col overflow-hidden border-border/70 bg-card shadow-none transition-colors hover:bg-muted/25",
				organisation.colour && "border-l-2"
			)}
		>
			<CardContent className="flex flex-row items-center gap-3 p-4">
				<Link
					href={`/organisations/${organisation.organisation_id}`}
					className="group"
				>
					<div className="w-10 h-10 relative flex items-center justify-center rounded-xl border">
						<div className="w-7 h-7 relative">
							<Logo
								id={organisation.organisation_id}
								alt={
									organisation.organisation_name ||
									"Lab logo"
								}
								className="object-contain"
								fill
							/>
						</div>
					</div>
				</Link>
				<div className="flex flex-col min-w-0 flex-1">
					<Link
						href={`/organisations/${organisation.organisation_id}`}
						className="font-semibold truncate leading-tight"
					>
						<span className="relative underline decoration-2 underline-offset-2 decoration-transparent hover:decoration-current transition-colors duration-200">
							{organisation.organisation_name}
						</span>
					</Link>
					{organisation.country_code && (
						<span className="mt-1 text-xs text-muted-foreground truncate flex items-center gap-1">
							<Link
								href={`/countries/${organisation.country_code.toLowerCase()}`}
							>
								<Image
									src={`/flags/${organisation.country_code.toLowerCase()}.svg`}
									alt={organisation.country_code}
									width={20}
									height={14}
									className="inline-block rounded-sm border"
								/>
							</Link>
							{formatLocation(organisation.country_code, organisation.subdivision_code)}
						</span>
					)}
				</div>
				<div className="ml-auto flex items-center gap-1">
					<Button
						asChild
						size="icon"
						variant="ghost"
						tabIndex={-1}
						className="group"
						style={
							{
								"--provider-color":
									organisation.colour ?? "inherit",
							} as React.CSSProperties
						}
					>
						<Link
							href={`/organisations/${organisation.organisation_id}`}
							aria-label={`Open ${organisation.organisation_name} lab`}
							tabIndex={-1}
						>
							<ArrowRight className="w-5 h-5 transition-colors group-hover:text-(--provider-color)" />
						</Link>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
