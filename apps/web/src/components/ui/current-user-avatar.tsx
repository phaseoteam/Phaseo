"use client";

import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type HeaderUser = {
	id?: string;
	email?: string | null;
	user_metadata?: {
		avatar_url?: string | null;
		full_name?: string | null;
		name?: string | null;
	};
} | null;

interface CurrentUserAvatarProps {
	user?: HeaderUser;
}

export const CurrentUserAvatar = ({ user }: CurrentUserAvatarProps) => {
	const profileImage = user?.user_metadata?.avatar_url ?? null;
	const name =
		user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? null;
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
		<Avatar className="h-8 w-8 rounded-lg border border-zinc-200/70 dark:border-zinc-800/70">
			{profileImage && (
				<AvatarImage src={profileImage} alt={avatarAlt} className="object-cover" />
			)}
			<AvatarFallback className="rounded-lg text-[11px] font-semibold">
				{fallbackLabel || <User className="h-4 w-4" />}
			</AvatarFallback>
		</Avatar>
	);
};
