import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function UserUsageChip({ userId, name, avatarUrl, workspaceId }: { userId: string; name: string | null; avatarUrl: string | null; workspaceId: string }) {
	const displayName = name || "Unknown user";
	const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
	const params = new URLSearchParams({ workspaceId, user: userId });
	return <Link href={`/settings/usage/overview?${params}`} title={`Usage for keys created by ${displayName}`} className="inline-flex max-w-full items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
		<Avatar size="sm">{avatarUrl && <AvatarImage src={avatarUrl} alt="" />}<AvatarFallback>{initials}</AvatarFallback></Avatar>
		<span className="truncate">{displayName}</span>
	</Link>;
}
