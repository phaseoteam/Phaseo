"use client";

import { cn } from "@/lib/utils";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

export function RoomResponseTimestamp({
	createdAt,
	className,
}: {
	createdAt: string;
	className?: string;
}) {
	const format = useDisplayFormatters();
	const label = format.timestamp(createdAt);

	return (
		<time
			dateTime={createdAt}
			className={cn(
				"select-none whitespace-nowrap text-xs text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/response:opacity-100 group-focus-within/response:opacity-100",
				className,
			)}
		>
			{label}
		</time>
	);
}
