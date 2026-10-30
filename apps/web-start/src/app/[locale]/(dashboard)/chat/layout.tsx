import type { Metadata, Viewport } from "next";
import { getTranslations } from "next-intl/server";
import { useLocale } from "next-intl";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChatViewportLock } from "./ChatViewportLock";
import { ReplayMaskBody } from "@/components/analytics/ReplayMaskBody";
import { buildMetadata } from "@/lib/seo";
import { ChatFeatureFlagsProvider } from "@/components/(chat)/ChatFeatureFlags";
import { shellDataQuery } from "@/components/header/shellData";
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

export default function ChatLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}) {
	// Shares the header's site-shell query (account + realtime/video flags) instead of fetching them again.
	const locale = useLocale();
	const { data: shellData } = useSuspenseQuery(shellDataQuery(locale));
	const realtimeEnabled = shellData.capabilities.realtime;
	const videoEnabled = shellData.capabilities.video;
	const initialAuth = shellData.account;

	return (
		<ScopedMessages params={params} namespaces={["Common.ui.accessibility", "Product.chat", "Product.privacyReview", "Product.chatRooms", "Product.experimentsCouncil", "Product.tools.request", "Catalogue.common", "Catalogue.models", "Catalogue.modelDetail", "Catalogue.updatesCalendar.weekdayAnalysis.showMore", "SettingsUI.chatGaps", "SettingsUI.strings", "Common.ui.auditCopy", "Common.ui.chatRooms", "Common.ui.status", "Common.ui.select", "Common.ui.actions", "Common.ui.media", "Common.ui.moderation", "Common.ui.requestBuilder", "Common.ui.chatComposer", "Common.ui.chatSettings", "Common.ui.chat", "Common.ui.openui", "Common.ui.responseLayout", "Common.ui.temporaryChat", "Common.ui.modelSettingsDialog", "Common.ui.filters"]}>
		<ChatAuthProvider initialAuth={initialAuth}>
			<ChatFeatureFlagsProvider
				realtimeEnabled={realtimeEnabled}
				videoEnabled={videoEnabled}
			>
				<ChatViewportLock />
				{/* Prompts, replies, titles and media stay out of session replay. */}
				<ReplayMaskBody />
				<div
					data-chat-viewport-root="true"
				className="ph-mask fixed inset-x-0 top-[calc(var(--chat-viewport-top,0px)+var(--site-notice-height,0px)+var(--site-header-height,3.75rem))] box-border flex h-[calc(var(--chat-viewport-height,100dvh)-var(--site-notice-height,0px)-var(--site-header-height,3.75rem))] min-h-0 min-w-0 flex-col overflow-hidden overscroll-none bg-background pb-[env(safe-area-inset-bottom)] [&_[data-slot=sidebar-container]]:!top-[calc(var(--chat-viewport-top,0px)+var(--site-notice-height,0px)+var(--site-header-height,3.75rem))] [&_[data-slot=sidebar-container]]:!bottom-[env(safe-area-inset-bottom)] [&_[data-slot=sidebar-container]]:!h-auto"
				>
					{children}
				</div>
			</ChatFeatureFlagsProvider>
		</ChatAuthProvider>
		</ScopedMessages>
	);
}
