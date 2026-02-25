"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Network, ChevronRight, ExternalLink, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import type { FamilyInfo } from "@/lib/fetchers/models/getFamilyModels";

export default function ModelFamilyButtonClient({
	family,
}: {
	family: FamilyInfo;
}) {
	const [open, setOpen] = useState(false);
	const router = useRouter();

	if (!family?.models?.length) return null;

	const models = family.models;
	const count = models.length;
	const familyName = family.family_name ?? "Model";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip delayDuration={0}>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="icon"
							className="p-2"
							aria-label={`Show models in ${familyName} family`}
						>
							<Network className="h-4 w-4" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent className="text-xs">
					View all models in the {familyName} family
				</TooltipContent>
			</Tooltip>

			<PopoverContent
				align="start"
				className="w-[min(92vw,420px)] p-0 shadow-xl"
				sideOffset={8}
			>
				{/* Header */}
				<div className="p-3 sm:p-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2 min-w-0">
							<Network className="h-4 w-4 text-muted-foreground" />
							<h3 className="text-sm font-semibold leading-none truncate">
								{familyName} Family
							</h3>
							<Badge
								variant="outline"
								className="rounded-full px-2 py-0 text-[10px]"
							>
								{count} model{count > 1 ? "s" : ""}
							</Badge>
						</div>
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7"
							onClick={() => setOpen(false)}
							aria-label="Close"
						>
							<X className="h-4 w-4" />
						</Button>
					</div>
				</div>

				<Separator />

				{/* List of Models */}
				<ScrollArea className="max-h-[50vh]">
					<ul className="p-2 sm:p-3">
						{models.map((m) => (
							<li key={m.model_id}>
								<button
									type="button"
									onClick={() => {
										setOpen(false);
										router.push(`/models/${m.model_id}`);
									}}
									className="group flex w-full items-center justify-between rounded-md px-2 py-2.5 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<div className="min-w-0">
										<div className="truncate text-sm font-medium">
											{m.name}
										</div>
										<div className="truncate text-xs text-muted-foreground">
											{m.model_id}
										</div>
									</div>
									<ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
								</button>
							</li>
						))}
					</ul>
				</ScrollArea>

				<Separator />

				{/* Footer */}
				<div className="flex items-center justify-between gap-2 p-3 sm:p-4">
					<div className="text-xs text-muted-foreground">
						{count} model{count > 1 ? "s" : ""} in this family.
					</div>
					{/* TODO: Add family pages */}
					{/* <Link
						href={`/families/${encodeURIComponent(
							familyName.toLowerCase()
						)}`}
						className="inline-flex items-center gap-1 text-xs font-medium underline decoration-transparent hover:decoration-current transition-colors duration-200"
					>
						View family overview
						<ExternalLink className="h-3.5 w-3.5" />
					</Link> */}
				</div>
			</PopoverContent>
		</Popover>
	);
}

