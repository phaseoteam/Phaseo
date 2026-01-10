import { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { Suspense } from "react";
import ChatPlaygroundShell from "@/components/(chat)/ChatPlaygroundShell";
import ChatPlaygroundLoader from "@/app/chat/ChatPlaygroundLoader";

export const metadata: Metadata = buildMetadata({
    title: "Chat playground - AI Stats Chat",
    description:
        "Chat with gateway models, tune parameters, and keep your chat history locally.",
    path: "/chat",
    keywords: ["AI chat", "playground", "AI Stats", "gateway", "chat UI"],
});

export default async function ChatPlaygroundPage() {
    return (
        <Suspense fallback={<ChatPlaygroundShell />}>
            <ChatPlaygroundLoader />
        </Suspense>
    );
}
