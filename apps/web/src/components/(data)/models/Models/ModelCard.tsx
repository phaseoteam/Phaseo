"use client";

import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
	TooltipProvider,
} from "@/components/ui/tooltip";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ModelCard as ModelCardType } from "@/lib/fetchers/models/getAllModels";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";

export function ModelCard({ model }: { model: ModelCardType }) {
	const modelSlug = model.model_id;
	return (
		<Card
			style={{ borderColor: model.organisation_colour || undefined }}
			className={cn(
				"h-full flex flex-col shadow-lg relative dark:shadow-zinc-900/25 dark:bg-zinc-950 transition-transform transform hover:scale-105 duration-200 ease-in-out",
				model.organisation_colour && "border-2",
			)}
		>
			<CardContent className="flex flex-row items-center gap-3 pt-6">
				<Link
					href={`/organisations/${model.organisation_id}`}
					prefetch={false}
					className="group"
					scroll
				>
					<div className="w-10 h-10 relative flex items-center justify-center rounded-xl border">
						<div className="w-7 h-7 relative">
							<Logo
								id={model.organisation_id}
								alt={model.organisation_name || "Provider Logo"}
								className="object-contain"
								fill
							/>
						</div>
					</div>
				</Link>
				<div className="flex flex-col min-w-0 flex-1 text-left">
					<div className="flex items-center gap-2 min-w-0">
						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								<Link
									href={`/models/${modelSlug}`}
									prefetch={false}
									className="font-semibold truncate leading-tight text-left"
								>
									<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
										{model.name}
									</span>
								</Link>
							</TooltipTrigger>
							<TooltipContent align="center">
								{modelSlug}
							</TooltipContent>
						</Tooltip>
						{model.hidden ? (
							<Badge variant="secondary" className="text-xs">
								Hidden
							</Badge>
						) : null}
					</div>
					<Link
						href={`/organisations/${model.organisation_id}`}
						prefetch={false}
						className="text-xs text-muted-foreground truncate flex items-center gap-1 text-left"
					>
						<span className="relative after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
							{model.organisation_name}
						</span>
					</Link>
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
									model.organisation_colour ?? "inherit",
							} as React.CSSProperties
						}
					>
						<Link
							href={`/models/${modelSlug}`}
							prefetch={false}
							aria-label={`Go to ${model.name} details`}
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
