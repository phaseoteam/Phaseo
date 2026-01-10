import ChatPlayground from "@/components/(chat)/ChatPlayground";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";

export default async function ChatPlaygroundLoader() {
    const models = await fetchFrontendGatewayModels();
    return <ChatPlayground models={models} />;
}
