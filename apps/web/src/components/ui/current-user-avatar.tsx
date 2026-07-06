"use client";

import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type HeaderUser = {
	id?: string;
	email?: string | null;
	displayName?: string | null;
	avatarUrl?: string | null;
	user_metadata?: {
		avatar_url?: string | null;
		picture?: string | null;
		full_name?: string | null;
		name?: string | null;
	};
} | null;

interface CurrentUserAvatarProps {
	user?: HeaderUser;
	className?: string;
}

function getHighResolutionAvatarUrl(url: string | null) {
	if (!url) return null;

	try {
		const parsedUrl = new URL(url);
		const hostname = parsedUrl.hostname.toLowerCase();

		if (hostname.includes("googleusercontent.com")) {
			if (parsedUrl.searchParams.has("sz")) {
				parsedUrl.searchParams.set("sz", "256");
				return parsedUrl.toString();
			}

			return url
				.replace(/=s\d+(?:-c)?$/i, "=s256-c")
				.replace(/\/s\d+(?:-c)?\//i, "/s256-c/");
		}

		if (hostname.includes("gravatar.com")) {
			parsedUrl.searchParams.set("s", "256");
			return parsedUrl.toString();
		}

		return url;
	} catch {
		return url;
	}
}

export const CurrentUserAvatar = ({ user, className }: CurrentUserAvatarProps) => {
	const profileImage =
		user?.avatarUrl ??
		user?.user_metadata?.avatar_url ??
		user?.user_metadata?.picture ??
		null;
	const highResolutionProfileImage = getHighResolutionAvatarUrl(profileImage);
	const name =
		user?.displayName ??
		user?.user_metadata?.full_name ??
		user?.user_metadata?.name ??
		null;
	const emailLocalPart = user?.email?.split("@")?.[0] ?? null;
	const displayName = name?.trim() || emailLocalPart || null;

	const initials = displayName
		?.split(/[\s._-]+/)
		.filter(Boolean)
		.slice(0, 2)
		?.map((word) => word[0])
		?.join("")
		?.toUpperCase();
	const fallbackLabel = initials && initials.trim().length > 0 ? initials : "U";
	const avatarAlt = name ? `${name} avatar` : "User avatar";

	return (
		<Avatar
			className={cn(
				"h-8 w-8 rounded-full bg-zinc-100 after:border-zinc-200/70 after:mix-blend-normal dark:bg-zinc-900 dark:after:border-zinc-800/70 dark:after:mix-blend-normal",
				className,
			)}
		>
			{highResolutionProfileImage && (
				<AvatarImage
					src={highResolutionProfileImage}
					alt={avatarAlt}
					className="rounded-full object-cover"
					referrerPolicy="no-referrer"
				/>
			)}
			<AvatarFallback className="rounded-full text-[11px] font-semibold">
				{fallbackLabel || <User className="h-4 w-4" />}
			</AvatarFallback>
		</Avatar>
	);
};
