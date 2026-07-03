import type { Metadata, Viewport } from "next";
import { ChatViewportLock } from "@/app/chat/ChatViewportLock";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
	title: "AI Chat Playground",
	description:
		"Chat with gateway models, tune parameters, and compare responses in one playground.",
	path: "/chat",
	keywords: ["AI chat", "chat playground", "model comparison", "gateway chat"],
});

export const viewport: Viewport = {
	interactiveWidget: "resizes-content",
};

export default function ChatLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<main
			data-chat-viewport-root="true"
			className="fixed inset-x-0 top-[var(--chat-viewport-top,0px)] box-border flex h-[var(--chat-viewport-height,100dvh)] min-h-0 flex-col overflow-hidden overscroll-none bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
		>
			<ChatViewportLock />
			{children}
		</main>
	);
}
