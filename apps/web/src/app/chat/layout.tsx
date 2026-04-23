import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
	title: "AI Chat Playground",
	description:
		"Chat with gateway models, tune parameters, and compare responses in one playground.",
	path: "/chat",
	keywords: ["AI chat", "chat playground", "model comparison", "gateway chat"],
});

export default function ChatLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <main className="box-border flex h-[calc(100svh-var(--site-notice-height,0px))] min-h-0 flex-col overflow-hidden overscroll-none bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:h-[calc(100dvh-var(--site-notice-height,0px))]">
            {children}
        </main>
    );
}
