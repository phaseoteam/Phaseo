// Shadcn.io Announcement Component

import type { ComponentProps, HTMLAttributes } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type AnnouncementProps = ComponentProps<typeof Badge> & {
	themed?: boolean;
};

export const Announcement = ({
	variant = "outline",
	themed = false,
	className,
	...props
}: AnnouncementProps) => (
	<Badge
		className={cn(
			"group max-w-full gap-2 rounded-full bg-white px-3 py-0.5 font-medium shadow-xs transition-all dark:bg-zinc-950",
			"hover:shadow-md",
			themed &&
				"announcement-themed border-zinc-950/5 dark:border-zinc-50/5",
			className
		)}
		variant={variant}
		{...props}
	/>
);

export type AnnouncementTagProps = HTMLAttributes<HTMLDivElement>;

export const AnnouncementTag = ({
	className,
	...props
}: AnnouncementTagProps) => (
	<div
		className={cn(
			"-ml-2.5 shrink-0 truncate rounded-full bg-zinc-950/5 px-2.5 py-1 text-xs dark:bg-zinc-50/5",
			"group-[.announcement-themed]:bg-white/60 dark:group-[.announcement-themed]:bg-zinc-950/60",
			className
		)}
		{...props}
	/>
);

export type AnnouncementTitleProps = HTMLAttributes<HTMLDivElement>;

export const AnnouncementTitle = ({
	className,
	...props
}: AnnouncementTitleProps) => (
	<div
		className={cn("flex items-center gap-1 truncate py-1", className)}
		{...props}
	/>
);
