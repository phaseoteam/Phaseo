"use client";

import { ThinkingOrb } from "thinking-orbs";
import { cn } from "@/lib/utils";

type RoomWorkingIndicatorProps = {
	label: string;
	size?: number;
	className?: string;
	showLabel?: boolean;
};

export function RoomWorkingIndicator({
	label,
	size = 18,
	className,
	showLabel = true,
}: RoomWorkingIndicatorProps) {
	return (
		<span
			role="status"
			aria-live="polite"
			className={cn("inline-flex items-center justify-center gap-1.5", className)}
		>
			<ThinkingOrb
				state="working"
				size={20}
				style={{ width: size, height: size }}
				aria-label={label}
			/>
			{showLabel ? <span>{label}</span> : null}
		</span>
	);
}
