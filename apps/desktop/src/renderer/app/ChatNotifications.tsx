import { useEffect, useMemo, useRef } from "react";

/** Chats settle for a moment after launch (the empty placeholder fills, interrupted ones are marked); none of that is news. */
const SETTLE_MS = 5000;
import { useWorkspace } from "./workspace";
import { useWorkspacePreferences } from "../lib/workspacePreferences";
import { badgeCount, chatNotices } from "../lib/chatNotices";
import { showToast } from "../components/ui/toast";

/** The taskbar overlay: Windows shows a small image, not a number, so the count is drawn. */
function badgeImage(count: number) {
	const canvas = document.createElement("canvas"), size = 32;
	canvas.width = canvas.height = size;
	const context = canvas.getContext("2d");
	if (!context) return undefined;
	context.fillStyle = "#e5484d";
	context.beginPath(); context.roundRect(0, 0, size, size, 8); context.fill();
	context.fillStyle = "#ffffff"; context.textAlign = "center"; context.textBaseline = "middle";
	context.font = `600 ${count > 9 ? 17 : 21}px Montserrat, system-ui, sans-serif`;
	context.fillText(count > 99 ? "99+" : String(count), size / 2, size / 2 + 1);
	return canvas.toDataURL("image/png");
}

/**
 * Notifications: while Phaseo has focus, a toast says another chat finished or needs you (desktop
 * alerts cover the background), and the dock or taskbar icon counts unread chats. Both follow Settings → Notifications.
 */
export function ChatNotifications() {
	const { overview, selectedId, select } = useWorkspace();
	const preferences = useWorkspacePreferences();
	const memory = useRef<Map<string, string> | undefined>(undefined);
	const startedAt = useRef(Date.now());
	const open = useRef(selectedId); open.current = selectedId;
	useEffect(() => {
		const { next, notices } = chatNotices(memory.current, overview.tasks, open.current);
		memory.current = next;
		if (Date.now() - startedAt.current < SETTLE_MS) return;
		if (!preferences.inAppNotifications || !document.hasFocus()) return;
		// A burst (a batch of agents finishing) is one toast, not a stack.
		if (notices.length > 3) { showToast("info", `${notices.length} chats have updates`); return; }
		for (const notice of notices) showToast(notice.type, notice.title, notice.chat, { label: "Open", onClick: () => select(notice.id) });
	}, [overview.tasks]); // Only a new overview is news; the open chat and settings are read as they are.
	const count = useMemo(() => preferences.notificationBadge ? badgeCount(overview.tasks) : 0, [overview.tasks, preferences.notificationBadge]);
	useEffect(() => { void window.phaseoDesktop?.setBadge?.(count, count ? badgeImage(count) : undefined).catch(() => undefined); }, [count]);
	return null;
}
