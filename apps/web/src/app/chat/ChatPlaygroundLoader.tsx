import ChatPlayground from "@/components/(chat)/ChatPlayground";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";

type ChatPlaygroundLoaderProps = {
    modelParam?: string | null;
    promptParam?: string | null;
};

export default async function ChatPlaygroundLoader({
    modelParam,
    promptParam,
}: ChatPlaygroundLoaderProps) {
    const models = await fetchFrontendGatewayModels();
    return (
        <ChatPlayground
            models={models}
            modelParam={modelParam ?? null}
            promptParam={promptParam ?? null}
        />
    );
}