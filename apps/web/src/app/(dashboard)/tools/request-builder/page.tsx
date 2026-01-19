import { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import RequestBuilder from "@/components/(tools)/RequestBuilder";
import { getGatewaySupportedModels } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

export const metadata: Metadata = buildMetadata({
    title: "Request builder - Generate AI API Requests & Code for AI Stats Conduit",
    description:
        "Interactively build AI API requests for the AI Stats Conduit and providers. Configure models and parameters, then export ready-to-run code snippets in your favourite language.",
    path: "/tools/request-builder",
    keywords: [
        "API request builder",
        "AI API requests",
        "code snippets",
        "curl generator",
        "AI conduit",
        "AI Stats tools",
    ],
});

export default async function RequestBuilderPage() {
    const models = await getGatewaySupportedModels();

    return <RequestBuilder models={models} />;
}
