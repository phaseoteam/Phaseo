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
        <main className="h-dvh overflow-hidden bg-background">{children}</main>
    );
}
