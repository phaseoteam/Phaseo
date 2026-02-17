"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ProviderLogo } from "./ProviderLogo";

export function ProviderLogoName({
	id,
	name,
	href,
	size = "xs",
	className,
	mobilePopover = false,
}: {
	id: string;
	name: string;
	href?: string;
	size?: React.ComponentProps<typeof ProviderLogo>["size"];
	className?: string;
	mobilePopover?: boolean;
}) {
	if (!href) {
		return (
			<ProviderLogo id={id} alt={name} size={size} className={className} />
		);
	}

	return (
		<>
			{/* Desktop: hover tooltip while keeping normal navigation */}
			<Tooltip>
				<TooltipTrigger asChild>
					<Link
						href={href}
						className={cn("hidden lg:inline-flex items-center", className)}
						aria-label={name}
					>
						<ProviderLogo id={id} alt={name} size={size} />
					</Link>
				</TooltipTrigger>
				<TooltipContent sideOffset={8}>{name}</TooltipContent>
			</Tooltip>

			{/* Mobile/tablet: press to reveal name (optionally with a link) */}
			{mobilePopover ? (
				<Popover>
					<PopoverTrigger asChild>
						<button
							type="button"
							className={cn("inline-flex lg:hidden items-center", className)}
							aria-label={`Show ${name}`}
						>
							<ProviderLogo id={id} alt={name} size={size} />
						</button>
					</PopoverTrigger>
					<PopoverContent align="center" className="w-64 p-3">
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0">
								<div className="text-xs text-muted-foreground">Provider</div>
								<div className="truncate font-medium">{name}</div>
							</div>
							<Link
								href={href}
								className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
							>
								Open
								<ExternalLink className="h-3.5 w-3.5" />
							</Link>
						</div>
					</PopoverContent>
				</Popover>
			) : (
				<Link
					href={href}
					className={cn("inline-flex lg:hidden items-center", className)}
					aria-label={name}
				>
					<ProviderLogo id={id} alt={name} size={size} />
				</Link>
			)}
		</>
	);
}

