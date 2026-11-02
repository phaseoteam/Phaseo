import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NotificationsView } from "@/components/work/WorkNotifications";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { listFrom, loadWork, requireWorkPage } from "@/lib/work/server";
import type { WorkNotification, WorkNotificationsResponse } from "@/lib/work/types";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work.notifications");
	return { title: t("title") };
}

export default async function WorkNotificationsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
	const context = await requireWorkPage();
	const unreadOnly = (await searchParams).all !== "1";
	const result = await loadWork<WorkNotificationsResponse>(context, "notifications", { unread: unreadOnly ? 1 : undefined, limit: 50 });
	if (!result.ok) return <WorkLoadError status={result.status} message={result.message} />;
	return (
		<NotificationsView
			notifications={listFrom<WorkNotification>(result.data, "notifications")}
			unreadCount={Number(result.data.unreadCount) || 0}
			unreadOnly={unreadOnly}
			nextCursor={result.data.nextCursor ?? null}
		/>
	);
}
