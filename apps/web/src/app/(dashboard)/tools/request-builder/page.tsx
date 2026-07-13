import { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import RequestBuilder from "@/components/(tools)/RequestBuilder";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";

export const metadata: Metadata = buildMetadata({
    title: "Request Builder",
    description:
        "Interactively build AI API requests for the Phaseo Gateway and providers. Configure models and parameters, then export ready-to-run code snippets in your favourite language.",
    path: "/tools/request-builder",
    keywords: [
        "API request builder",
        "AI API requests",
        "code snippets",
        "curl generator",
        "AI gateway",
        "Phaseo tools",
    ],
});

export default async function RequestBuilderPage() {
    const models = await fetchFrontendGatewayModels();

    return <RequestBuilder models={models} />;
}
