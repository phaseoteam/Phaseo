"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { useDisplayPreferences } from "@/components/providers/DisplayPreferencesProvider";
import { cn } from "@/lib/utils";

export function SensitiveValue({
	children,
	className,
	contentClassName,
	inline = false,
	label = "sensitive value",
}: {
	children: React.ReactNode;
	className?: string;
	contentClassName?: string;
	inline?: boolean;
	label?: string;
}) {
	const { preferences } = useDisplayPreferences();
	const [revealed, setRevealed] = React.useState(false);
	const Tag = inline ? "span" : "div";

	return (
		<Tag className={cn(inline ? "inline-flex items-center gap-1" : "relative", className)}>
			<Tag
				data-pii="true"
				data-pii-revealed={revealed ? "true" : undefined}
				className={cn(!inline && preferences.maskSensitiveData && "[&_input]:pr-10", contentClassName)}
			>
				{children}
			</Tag>
			{preferences.maskSensitiveData ? (
				<button
					type="button"
					aria-label={`${revealed ? "Mask" : "Reveal"} ${label}`}
					aria-pressed={revealed}
					title={`${revealed ? "Mask" : "Reveal"} ${label}`}
					onClick={() => setRevealed((current) => !current)}
					className={cn(
						"z-10 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						!inline && "absolute right-1 top-1/2 -translate-y-1/2 bg-background/90",
					)}
				>
					{revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
				</button>
			) : null}
		</Tag>
	);
}
