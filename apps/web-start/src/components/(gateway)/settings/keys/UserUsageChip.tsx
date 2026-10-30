"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu";

export function UserUsageChip({ userId, name, avatarUrl, workspaceId, currentUserId, canViewWorkspaceUsers = false }: { userId: string; name: string | null; avatarUrl: string | null; workspaceId: string; currentUserId?: string; canViewWorkspaceUsers?: boolean }) {
	const t = useTranslations("SettingsUI");
	const displayName = name || t("oauthDetail.unknownUser");
	const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
	const params = new URLSearchParams({ workspaceId, user: userId, usage_preset: "last_30d" });
	const ownProfile = userId === currentUserId;
	const profileHref = `/settings/workspaces/users/${encodeURIComponent(userId)}?${new URLSearchParams({ workspaceId })}`;
	const className = "inline-flex max-w-full items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-3 text-sm font-medium";
	const content = <>
		<Avatar size="sm">{avatarUrl && <AvatarImage src={avatarUrl} alt="" />}<AvatarFallback>{initials}</AvatarFallback></Avatar>
		<span className="truncate">{displayName}</span>
	</>;
	if (!ownProfile && !canViewWorkspaceUsers) return <span className={className}>{content}</span>;
	const chip = <Link href={ownProfile ? "/settings/profile" : profileHref} title={t("workspaceUser.viewProfile")} className={`${className} hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring`}>{content}</Link>;
	if (!canViewWorkspaceUsers) return chip;
	return <ContextMenu><ContextMenuTrigger asChild>{chip}</ContextMenuTrigger><ContextMenuContent>
		<ContextMenuItem asChild><Link href={ownProfile ? "/settings/profile" : profileHref}>{t("workspaceUser.viewProfile")}</Link></ContextMenuItem>
		<ContextMenuItem asChild><Link href={`${profileHref}#keys`}>{t("workspaceUser.viewKeys")}</Link></ContextMenuItem>
		<ContextMenuItem asChild><Link href={`/settings/usage/overview?${params}`}>{t("workspaceUser.viewActivity")}</Link></ContextMenuItem>
		<ContextMenuItem asChild><Link href={`${profileHref}#logs`}>{t("workspaceUser.viewLogs")}</Link></ContextMenuItem>
	</ContextMenuContent></ContextMenu>;
}
