import type { ElementType } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ModelTypeHeaderProps {
	title: string;
	description: string;
	helper?: string;
	count: number;
	icon: ElementType;
	accentClass?: string;
	badgeClass?: string;
}

export default function ModelTypeHeader({
	title,
	description,
	helper,
	count,
	icon: Icon,
	accentClass,
	badgeClass,
}: ModelTypeHeaderProps) {
	return (
		<div className="rounded-2xl border border-neutral-200 bg-gradient-to-br from-white via-white to-neutral-50 p-4 shadow-sm sm:p-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex items-start gap-3">
					<div
						className={cn(
							"flex h-10 w-10 items-center justify-center rounded-xl border bg-white",
							accentClass
						)}
					>
						<Icon className="h-5 w-5" />
					</div>
					<div className="space-y-1">
						<h2 className="text-lg font-semibold">{title}</h2>
						<p className="text-sm text-muted-foreground">
							{description}
						</p>
					</div>
				</div>
				<Badge
					variant="secondary"
					className={cn("text-xs", badgeClass)}
				>
					{count} models
				</Badge>
			</div>
			{helper && (
				<p className="mt-3 text-xs text-muted-foreground">{helper}</p>
			)}
		</div>
	);
}
