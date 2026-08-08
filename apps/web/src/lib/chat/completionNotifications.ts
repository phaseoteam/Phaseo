import { getRoomScopedStorageKey } from "@/lib/chat/rooms"

export const CHAT_COMPLETION_NOTIFICATIONS_STORAGE_KEY = getRoomScopedStorageKey(
	"text",
	"notify-on-complete",
)

let sessionEnabled = false

export type ChatNotificationEnableResult =
	| { enabled: true }
	| { enabled: false; reason: "denied" | "unsupported" }

export function chatCompletionNotificationsSupported(): boolean {
	return typeof window !== "undefined" && "Notification" in window
}

export function chatCompletionNotificationsEnabled(): boolean {
	if (!chatCompletionNotificationsSupported()) return false
	if (window.Notification.permission !== "granted") return false
	try {
		return (
			window.localStorage.getItem(CHAT_COMPLETION_NOTIFICATIONS_STORAGE_KEY) ===
				"true" || sessionEnabled
		)
	} catch {
		return sessionEnabled
	}
}

export function disableChatCompletionNotifications(): void {
	if (typeof window === "undefined") return
	sessionEnabled = false
	try {
		window.localStorage.setItem(CHAT_COMPLETION_NOTIFICATIONS_STORAGE_KEY, "false")
	} catch {
		// Storage can be unavailable in privacy-restricted browsing contexts.
	}
}

export async function enableChatCompletionNotifications(): Promise<ChatNotificationEnableResult> {
	if (!chatCompletionNotificationsSupported()) {
		return { enabled: false, reason: "unsupported" }
	}

	let permission = window.Notification.permission
	if (permission === "default") {
		permission = await window.Notification.requestPermission()
	}
	if (permission !== "granted") {
		disableChatCompletionNotifications()
		return { enabled: false, reason: "denied" }
	}

	try {
		window.localStorage.setItem(CHAT_COMPLETION_NOTIFICATIONS_STORAGE_KEY, "true")
	} catch {
		// Keep the preference for this session when storage is unavailable.
	}
	sessionEnabled = true
	return { enabled: true }
}

export function showChatCompletionNotification(): boolean {
	if (!chatCompletionNotificationsEnabled()) return false
	if (document.visibilityState === "visible" && document.hasFocus()) return false

	try {
		const notification = new window.Notification("Chat response ready", {
			body: "Your response has finished generating in Phaseo Chat.",
			icon: "/logo_light.svg",
			tag: "phaseo-chat-response-ready",
		})
		notification.onclick = () => {
			window.focus()
			notification.close()
		}
		return true
	} catch {
		return false
	}
}
