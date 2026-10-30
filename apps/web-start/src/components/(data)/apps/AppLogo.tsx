"use client";

import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export default function AppLogo({
	src,
	alt,
	fallback,
	className,
	fallbackClassName,
}: {
	src?: string | null;
	alt: string;
	fallback: ReactNode;
	className?: string;
	fallbackClassName?: string;
}) {
	return (
		<Avatar
			className={cn(
				"overflow-hidden rounded-md bg-muted/30 after:rounded-md",
				className,
			)}
		>
			<AvatarImage
				src={src ?? undefined}
				alt={alt}
				className="rounded-md object-cover"
			/>
			<AvatarFallback
				className={cn("rounded-md font-semibold", fallbackClassName)}
			>
				{fallback}
			</AvatarFallback>
		</Avatar>
	);
}
