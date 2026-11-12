import { Outlet } from "@tanstack/react-router";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import { useLocale } from "@/i18n/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChatViewportLock } from "./ChatViewportLock";
import { ReplayMaskBody } from "@/components/analytics/ReplayMaskBody";
import { buildMetadata } from "@/lib/seo";
import { ChatFeatureFlagsProvider } from "@/components/(chat)/ChatFeatureFlags";
import { shellDataQuery } from "@/components/header/shellData";
import { ChatAuthProvider } from "@/components/(chat)/ChatAuthProvider";

export async function getChatLayoutMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({
		title: t("title"),
		description: t("description"),
		path: "/chat",
		keywords: ["AI chat", "chat playground", "model comparison", "gateway chat"],
	});
}

export default function ChatLayout() {
	// Shares the header's site-shell query (account + realtime/video flags) instead of fetching them again.
	const locale = useLocale();
	const { data: shellData } = useSuspenseQuery(shellDataQuery(locale));
	const realtimeEnabled = shellData.capabilities.realtime;
	const videoEnabled = shellData.capabilities.video;
	const initialAuth = shellData.account;

	return (
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
					<Outlet />
				</div>
			</ChatFeatureFlagsProvider>
		</ChatAuthProvider>
	);
}
