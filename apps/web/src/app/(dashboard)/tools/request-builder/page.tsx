import { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import RequestBuilder from "@/components/(tools)/RequestBuilder";
import { getGatewaySupportedModels } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { resolveIncludeHidden } from "@/lib/fetchers/models/visibility";

export const metadata: Metadata = buildMetadata({
    title: "Request builder - Generate AI API Requests & Code for AI Stats Gateway",
    description:
        "Interactively build AI API requests for the AI Stats Gateway and providers. Configure models and parameters, then export ready-to-run code snippets in your favourite language.",
    path: "/tools/request-builder",
    keywords: [
        "API request builder",
        "AI API requests",
        "code snippets",
        "curl generator",
        "AI gateway",
        "AI Stats tools",
    ],
});

export default async function RequestBuilderPage() {
    const includeHidden = await resolveIncludeHidden();
    const models = await getGatewaySupportedModels(includeHidden);

    return <RequestBuilder models={models} />;
}
