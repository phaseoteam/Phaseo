import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APIProviderCard as APIProviderCardType } from "@/lib/fetchers/api-providers/getAllAPIProviders";
import { Logo } from "@/components/Logo";

type Props = {
	api_provider: APIProviderCardType;
};

export default function APIProviderCard({ api_provider }: Props) {
	// normalize field names we'll use in the component
	const id = api_provider.api_provider_id;
	const name = api_provider.api_provider_name;
	const country = api_provider.country_code ?? "xx";

	return (
		<Card
			className={cn(
				"h-full flex flex-col shadow-lg relative dark:shadow-zinc-900/25 dark:bg-zinc-950 transition-transform transform hover:scale-105 duration-200 ease-in-out"
			)}
		>
			<CardContent className="flex flex-row items-center gap-4 pt-6">
				<Link href={`/api-providers/${id}`} prefetch={false} className="group">
					<div className="w-12 h-12 relative flex items-center justify-center rounded-xl border">
						<div className="w-9 h-9 relative">
							<Logo
								id={id}
								alt={name}
								className="object-contain group-hover:opacity-80 transition"
								fill
							/>
						</div>
					</div>
				</Link>
				<div className="flex flex-col flex-1 min-w-0">
					<CardTitle className="truncate flex flex-col items-start gap-1">
						<Link
							href={`/api-providers/${id}`}
							prefetch={false}
							className="font-semibold"
						>
							<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
								{name}
							</span>
						</Link>
						{country && (
							<span className="mt-1 text-xs text-muted-foreground truncate flex items-center gap-1">
								<Link
									href={`/countries/${country.toLowerCase()}`}
									prefetch={false}
								>
									<Image
										src={`/flags/${country.toLowerCase()}.svg`}
										alt={`${country} flag`}
										width={20}
										height={14}
										className="inline-block rounded-sm border"
									/>
								</Link>
							</span>
						)}
					</CardTitle>
				</div>
				<Button asChild size="icon" variant="ghost" tabIndex={-1}>
					<Link
						href={`/api-providers/${id}`}
						prefetch={false}
						aria-label={`Go to ${name} details`}
						tabIndex={-1}
						className="group"
					>
						<ArrowRight
							className={cn(
								"w-5 h-5 transition-colors group-hover:text-[var(--provider-arrow-color)]"
							)}
						/>
					</Link>
				</Button>
			</CardContent>
		</Card>
	);
}
