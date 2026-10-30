import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PriceProviderCard({
	id,
	name,
	description,
	colour,
	country_code,
}: {
	id: string;
	name: string;
	description?: string;
	colour?: string;
	country_code?: string;
}) {
	return (
		<Card
			style={{ borderColor: colour || undefined }}
			className={cn(
				"h-full flex flex-col shadow-lg relative dark:shadow-zinc-900/25 dark:bg-zinc-950 transition-transform transform hover:scale-105 duration-200 ease-in-out",
				colour && "border-2"
			)}
		>
			<CardContent className="flex flex-row items-center gap-4 pt-6">
				<Link href={`prices/${id}`} className="group">
					<div className="w-12 h-12 relative flex items-center justify-center rounded-full border bg-white">
						<div className="w-9 h-9 relative">
							<Image
								src={`/providers/${id}.svg`}
								alt={name}
								className="object-contain group-hover:opacity-80 transition"
								fill
							/>
						</div>
					</div>
				</Link>
				<div className="flex flex-col flex-1 min-w-0">
					<CardTitle className="truncate flex flex-col items-start gap-1">
						<Link href={`/prices/${id}`} className="font-semibold">
							<span className="relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
								{name}
							</span>
						</Link>
					</CardTitle>
				</div>
				<Button
					asChild
					size="icon"
					variant="ghost"
					tabIndex={-1}
					style={
						{
							"--provider-arrow-color": colour ?? "inherit",
						} as React.CSSProperties
					}
				>
					<Link
						href={`prices/${id}`}
						aria-label={`Go to ${name} details`}
						tabIndex={-1}
						className="group"
					>
						<ArrowRight
							className={cn(
								"w-5 h-5 transition-colors group-hover:text-(--provider-arrow-color)"
							)}
						/>
					</Link>
				</Button>
			</CardContent>
		</Card>
	);
}
