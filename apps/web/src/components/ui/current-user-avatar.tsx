"use client";

import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
}

export const CurrentUserAvatar = ({ user }: CurrentUserAvatarProps) => {
	const profileImage =
		user?.avatarUrl ??
		user?.user_metadata?.avatar_url ??
		user?.user_metadata?.picture ??
		null;
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
		<Avatar className="h-8 w-8 rounded-full after:border-zinc-200/70 after:mix-blend-normal dark:after:border-zinc-800/70 dark:after:mix-blend-normal">
			{profileImage && (
				<AvatarImage
					src={profileImage}
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
