import ChatPlayground from "@/components/(chat)/ChatPlayground";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";

type ChatPlaygroundLoaderProps = {
    modelParam?: string | null;
    promptParam?: string | null;
};

const decodeQueryValue = (value: string): string => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

export default async function ChatPlaygroundLoader({
    modelParam,
    promptParam,
}: ChatPlaygroundLoaderProps) {
    const models = await fetchFrontendGatewayModels();
	const trimmedModelParam = decodeQueryValue((modelParam ?? "").trim());
	const modelIdSet = new Set(models.map((m) => m.modelId));
	let resolvedModelParam: string | null = trimmedModelParam || null;

	if (resolvedModelParam && !modelIdSet.has(resolvedModelParam)) {
		// Unknown/unsupported model; let the playground fall back to its default.
		resolvedModelParam = null;
	}

    return (
        <ChatPlayground
            models={models}
            modelParam={resolvedModelParam}
            promptParam={promptParam ?? null}
        />
    );
}
