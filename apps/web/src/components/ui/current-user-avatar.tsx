"use client";

import { useCurrentUserImage } from "@/hooks/use-current-user-image";
import { useCurrentUserName } from "@/hooks/use-current-user-name";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export const CurrentUserAvatar = () => {
	const profileImage = useCurrentUserImage();
	const name = useCurrentUserName();
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		if (profileImage !== null || (name !== null && name !== "?")) {
			setIsLoading(false);
		}
	}, [profileImage, name]);

	useEffect(() => {
		const timer = setTimeout(() => setIsLoading(false), 300);
		return () => clearTimeout(timer);
	}, []);

	const hasValidName = name && name !== "?";
	const shouldShowAvatar = !isLoading && (profileImage || hasValidName);

	if (isLoading) {
		return (
			<div
				className={cn(
					"h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 animate-pulse"
				)}
			/>
		);
	}

	if (!shouldShowAvatar) {
		return null;
	}

	const initials = name
		?.split(" ")
		?.map((word) => word[0])
		?.join("")
		?.toUpperCase();

	return (
		<Avatar className="h-8 w-8 rounded-full">
			{profileImage && <AvatarImage src={profileImage} alt={initials} />}
			<AvatarFallback className="rounded-full">{initials}</AvatarFallback>
		</Avatar>
	);
};
