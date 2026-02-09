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

type ChatPageProps = {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function ChatPlaygroundPage({ searchParams }: ChatPageProps) {
    return (
        <Suspense fallback={<ChatPlaygroundShell />}>
            <ChatPlaygroundContent searchParams={searchParams} />
        </Suspense>
    );
}

async function ChatPlaygroundContent({ searchParams }: ChatPageProps) {
    const resolvedParams = (await searchParams) ?? {};
    const modelParamRaw = resolvedParams.model;
    const promptParamRaw = resolvedParams.prompt;
    const modelParam = Array.isArray(modelParamRaw) ? modelParamRaw[0] : modelParamRaw;
    const promptParam = Array.isArray(promptParamRaw) ? promptParamRaw[0] : promptParamRaw;

    return (
        <ChatPlaygroundLoader
            modelParam={modelParam ?? null}
            promptParam={promptParam ?? null}
        />
    );
}
