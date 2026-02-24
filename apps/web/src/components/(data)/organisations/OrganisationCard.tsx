import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { OrganisationCard as OrganisationTypeCard } from "@/lib/fetchers/organisations/getAllOrganisations";
import Image from "next/image";
import { Logo } from "@/components/Logo";

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
				"h-full flex flex-col shadow-lg relative dark:shadow-zinc-900/25 dark:bg-zinc-950 transition-transform transform hover:scale-105 duration-200 ease-in-out",
				organisation.colour && "border-2"
			)}
		>
			<CardContent className="flex flex-row items-center gap-3 pt-6">
				<Link
					href={`organisations/${organisation.organisation_id}`}
					className="group"
				>
					<div className="w-10 h-10 relative flex items-center justify-center rounded-xl border">
						<div className="w-7 h-7 relative">
							<Logo
								id={organisation.organisation_id}
								alt={
									organisation.organisation_name ||
									"Provider Logo"
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
							href={`organisations/${organisation.organisation_id}`}
							aria-label={`Go to ${organisation.organisation_name} details`}
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
