"use client";

import { useEffect, useState } from "react";
import { AlarmClock, AtSign, Bell, Bot, CheckCheck, CircleDot, Clock, MailCheck, MessageSquare, TrendingUp, UserPlus, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { getWorkNotifications, markWorkNotificationsRead } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { WorkNotification, WorkNotificationKind } from "@/lib/work/types";
import { useWorkAction } from "./useWorkAction";
import { TimeAgo } from "./WorkBits";

/** The bell on work pages. It checks the unread count on each page change and every two minutes. */
export function NotificationBell() {
	const t = useTranslations("Work.notifications");
	const pathname = usePathname();
	const [unread, setUnread] = useState<number | null>(null);
	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			const result = await getWorkNotifications({ unread: true, limit: 1 }).catch(() => null);
			if (!cancelled && result?.ok) setUnread(Number(result.unreadCount) || 0);
		};
		void load();
		const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 120_000);
		return () => { cancelled = true; window.clearInterval(timer); };
	}, [pathname]);
	const label = unread ? t("bellUnread", { count: unread }) : t("title");
	return (
		<Link href="/work/inbox" aria-label={label} title={label} aria-current={pathname === "/work/inbox" ? "page" : undefined}
			className="relative inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground">
			<Bell className="size-4" aria-hidden="true" />
			{unread ? (
				<span aria-hidden="true" className="absolute -top-0.5 -right-0.5 min-w-4 rounded-md bg-foreground px-1 text-center text-[10px] leading-4 font-medium text-background tabular-nums">
					{unread > 99 ? "99+" : unread}
				</span>
			) : null}
		</Link>
	);
}

const KIND_ICONS: Record<WorkNotificationKind, LucideIcon> = {
	assigned: UserPlus,
	comment: MessageSquare,
	mention: AtSign,
	state: CircleDot,
	sla: AlarmClock,
	stalled: Clock,
	error_spike: TrendingUp,
	agent: Bot,
	reply_draft: MailCheck,
};

export function NotificationsView({ notifications: initial, unreadCount, unreadOnly, nextCursor }: { notifications: WorkNotification[]; unreadCount: number; unreadOnly: boolean; nextCursor: string | null }) {
	const t = useTranslations("Work.notifications");
	const router = useRouter();
	const { perform, busy } = useWorkAction();
	const [extra, setExtra] = useState<{ items: WorkNotification[]; cursor: string | null }>({ items: [], cursor: nextCursor });
	const [readIds, setReadIds] = useState<Set<string>>(new Set());
	const [seen, setSeen] = useState(initial);
	if (seen !== initial) { setSeen(initial); setExtra({ items: [], cursor: nextCursor }); setReadIds(new Set()); }
	const notifications = [...initial, ...extra.items];
	const isRead = (notification: WorkNotification) => Boolean(notification.readAt) || readIds.has(notification.id);

	const markRead = async (ids: string[]) => {
		setReadIds((current) => new Set([...current, ...ids]));
		const result = await perform("read", () => markWorkNotificationsRead({ ids }));
		if (!result.ok) setReadIds((current) => { const next = new Set(current); for (const id of ids) next.delete(id); return next; });
	};

	const open = async (notification: WorkNotification) => {
		if (!isRead(notification)) void markWorkNotificationsRead({ ids: [notification.id] });
		if (notification.workItemNumber) router.push(`/work/${notification.workItemNumber}`);
	};

	const loadMore = async () => {
		if (!extra.cursor) return;
		const result = await perform("more", () => getWorkNotifications({ unread: unreadOnly, cursor: extra.cursor ?? undefined }), { refresh: false });
		if (result.ok) setExtra((current) => ({ items: [...current.items, ...result.notifications], cursor: result.nextCursor ?? null }));
	};

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h2 className="text-base font-semibold">{t("title")}</h2>
					<p className="text-sm text-muted-foreground">{t("unreadCount", { count: unreadCount })}</p>
				</div>
				<div className="flex items-center gap-2">
					<nav aria-label={t("filter")} className="flex gap-1">
						<Link href="/work/inbox" aria-current={unreadOnly ? "page" : undefined} className={cn("rounded-md px-2.5 py-1 text-sm", unreadOnly ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>{t("unread")}</Link>
						<Link href="/work/inbox?all=1" aria-current={!unreadOnly ? "page" : undefined} className={cn("rounded-md px-2.5 py-1 text-sm", !unreadOnly ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>{t("all")}</Link>
					</nav>
					<Button type="button" size="sm" variant="outline" disabled={busy !== null || unreadCount === 0} onClick={() => perform("read-all", () => markWorkNotificationsRead({ all: true }))}>
						<CheckCheck aria-hidden="true" />{t("markAllRead")}
					</Button>
				</div>
			</div>
			{notifications.length ? (
				<ul className="divide-y rounded-md border">
					{notifications.map((notification) => {
						const Icon = KIND_ICONS[notification.kind] ?? Bell;
						const read = isRead(notification);
						return (
							<li key={notification.id} className={cn("flex items-start gap-3 px-3 py-2.5 text-sm", !read && "bg-muted/40")}>
								<span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Icon className="size-3.5" aria-hidden="true" /></span>
								<button type="button" onClick={() => open(notification)} className="min-w-0 flex-1 text-left">
									<span className="flex flex-wrap items-baseline gap-x-2">
										<span className={cn(!read && "font-medium")}>{t(`kinds.${notification.kind}`, { actor: notification.actorName ?? t("someone") })}</span>
										{notification.workItemNumber ? <span className="truncate text-muted-foreground"><span className="font-mono text-xs">#{notification.workItemNumber}</span> {notification.workItemTitle}</span> : null}
									</span>
									{notification.body ? <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{notification.body}</span> : null}
								</button>
								<span className="flex shrink-0 items-center gap-2">
									<TimeAgo value={notification.createdAt} className="text-xs text-muted-foreground" />
									{read ? null : (
										<Button type="button" size="icon-xs" variant="ghost" aria-label={t("markRead")} title={t("markRead")} disabled={busy !== null} onClick={() => markRead([notification.id])}>
											<span className="size-2 rounded-md bg-sky-600 dark:bg-sky-400" aria-hidden="true" />
										</Button>
									)}
								</span>
							</li>
						);
					})}
				</ul>
			) : <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{unreadOnly ? t("emptyUnread") : t("empty")}</p>}
			{extra.cursor ? <div className="flex justify-end"><Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={loadMore}>{t("showMore")}</Button></div> : null}
		</div>
	);
}
