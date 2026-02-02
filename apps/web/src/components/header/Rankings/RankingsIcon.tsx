"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function RankingsIcon() {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					asChild
				>
					<Link
						href="/rankings"
						aria-label="Rankings"
						className={cn(
							"inline-flex h-10 w-10 items-center justify-center rounded-lg",
							"text-zinc-600 hover:bg-zinc-100",
							"dark:text-zinc-300 dark:hover:bg-zinc-800",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60"
						)}
					>
						<Trophy className="size-4" />
					</Link>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				<p>Rankings</p>
			</TooltipContent>
		</Tooltip>
	);
}
