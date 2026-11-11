import { createContext, useContext } from "react";
import type { ModelAccess } from "@/lib/chat/modelAccess";

/**
 * What the header workspace's rules hide from Chat's model picker, so the picker can say why a model is missing.
 * Provided by ChatPlaygroundCatalog (which also removes those models from the list); null when not known.
 */
export const ChatModelAccessContext = createContext<ModelAccess | null>(null);

export function useChatModelAccess(): ModelAccess | null {
	return useContext(ChatModelAccessContext);
}
