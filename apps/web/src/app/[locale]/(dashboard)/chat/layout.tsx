import type { Metadata, Viewport } from "next";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { ChatViewportLock } from "./ChatViewportLock";
import { buildMetadata } from "@/lib/seo";
import { ChatFeatureFlagsProvider } from "@/components/(chat)/ChatFeatureFlags";
import { realtimeVoiceFlag, videoApiFlag } from "@/lib/flags";
import { fetchInternalAuthHeaderData } from "@/lib/fetchers/internal/fetchInternalAuthHeaderData";
import type { InternalAuthHeaderData } from "@/lib/fetchers/internal/authTypes";
import { ChatAuthProvider } from "@/components/(chat)/ChatAuthProvider";
import { ScopedMessages } from "@/components/i18n/ScopedMessages";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({
		title: t("title"),
		description: t("description"),
		path: "/chat",
		keywords: ["AI chat", "chat playground", "model comparison", "gateway chat"],
	});
}

export const viewport: Viewport = {
	interactiveWidget: "resizes-content",
};

export default async function ChatLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}) {
	await connection();
	const emptyAuth: InternalAuthHeaderData = {
		isLoggedIn: false,
		user: undefined,
		teams: [],
		currentTeamId: undefined,
		userRole: undefined,
	};
	const [realtimeEnabled, videoEnabled, initialAuth] = await Promise.all([
		realtimeVoiceFlag().catch(() => false),
		videoApiFlag().catch(() => false),
		fetchInternalAuthHeaderData().catch(() => emptyAuth),
	]);

	return (
		<ScopedMessages params={params} namespaces={["Common.ui.accessibility", "Product.chat", "Product.privacyReview", "Product.chatRooms", "Product.experimentsCouncil", "Product.tools.request", "Catalogue.common", "Catalogue.models", "Catalogue.modelDetail", "Catalogue.updatesCalendar.weekdayAnalysis.showMore", "SettingsUI.chatGaps", "SettingsUI.strings", "Common.ui.auditCopy", "Common.ui.chatRooms", "Common.ui.status", "Common.ui.select", "Common.ui.actions", "Common.ui.media", "Common.ui.moderation", "Common.ui.requestBuilder", "Common.ui.chatComposer", "Common.ui.chatSettings", "Common.ui.chat", "Common.ui.responseLayout", "Common.ui.temporaryChat", "Common.ui.modelSettingsDialog", "Common.ui.filters"]}>
		<ChatAuthProvider initialAuth={initialAuth}>
			<ChatFeatureFlagsProvider
				realtimeEnabled={realtimeEnabled}
				videoEnabled={videoEnabled}
			>
				<ChatViewportLock />
				<div
					data-chat-viewport-root="true"
				className="fixed inset-x-0 top-[calc(var(--chat-viewport-top,0px)+var(--site-header-height,3.75rem))] box-border flex h-[calc(var(--chat-viewport-height,100dvh)-var(--site-header-height,3.75rem))] min-h-0 min-w-0 flex-col overflow-hidden overscroll-none bg-background pb-[env(safe-area-inset-bottom)] [&_[data-slot=sidebar-container]]:!top-[calc(var(--chat-viewport-top,0px)+var(--site-header-height,3.75rem))] [&_[data-slot=sidebar-container]]:!bottom-[env(safe-area-inset-bottom)] [&_[data-slot=sidebar-container]]:!h-auto"
				>
					{children}
				</div>
			</ChatFeatureFlagsProvider>
		</ChatAuthProvider>
		</ScopedMessages>
	);
}
