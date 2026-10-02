"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
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
	const t = useTranslations("Catalogue.updates.routes");
	return (
		<div className={cn("flex items-center gap-2", className)}>
			<Button
				asChild
				size="sm"
				variant={active === "models" ? "default" : "ghost"}
				className={cn("rounded-md", active !== "models" && "text-muted-foreground")}
			>
				<Link href="/updates/models">
					{t("updates")}
				</Link>
			</Button>
			<Button
				asChild
				size="sm"
				variant={active === "calendar" ? "default" : "ghost"}
				className={cn("rounded-md", active !== "calendar" && "text-muted-foreground")}
			>
				<Link href="/updates/calendar">
					{t("calendar")}
				</Link>
			</Button>
		</div>
	);
}
