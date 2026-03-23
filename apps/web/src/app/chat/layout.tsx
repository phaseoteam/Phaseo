import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
    title: "AI Stats Chat",
    description:
        "Chat with gateway models, tune parameters, and keep your chat history locally.",
    path: "/chat",
    keywords: ["AI chat", "playground", "AI Stats", "gateway", "chat UI"],
});

export default function ChatLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <main className="box-border flex h-[100svh] min-h-0 flex-col overflow-hidden overscroll-none bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:h-dvh">
            {children}
        </main>
    );
}
