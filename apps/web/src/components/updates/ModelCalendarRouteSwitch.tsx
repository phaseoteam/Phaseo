"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ModelCalendarRouteSwitchProps = {
	active: "models" | "calendar";
	className?: string;
};

export default function ModelCalendarRouteSwitch({
	active,
	className,
}: ModelCalendarRouteSwitchProps) {
	return (
		<div className={cn("flex items-center gap-2", className)}>
			<Button
				asChild
				size="sm"
				variant={active === "models" ? "default" : "ghost"}
				className={cn(active !== "models" && "text-muted-foreground")}
			>
				<Link href="/updates/models" prefetch={false}>
					Updates
				</Link>
			</Button>
			<Button
				asChild
				size="sm"
				variant={active === "calendar" ? "default" : "ghost"}
				className={cn(active !== "calendar" && "text-muted-foreground")}
			>
				<Link href="/updates/calendar" prefetch={false}>
					Calendar
				</Link>
			</Button>
		</div>
	);
}
