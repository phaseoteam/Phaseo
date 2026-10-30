"use client";

import {
	createContext,
	useContext,
	type ReactNode,
} from "react";

type ChatFeatureFlags = {
	realtimeEnabled: boolean;
	videoEnabled: boolean;
};

const ChatFeatureFlagsContext = createContext<ChatFeatureFlags>({
	realtimeEnabled: false,
	videoEnabled: false,
});

export function ChatFeatureFlagsProvider({
	children,
	realtimeEnabled,
	videoEnabled,
}: ChatFeatureFlags & { children: ReactNode }) {
	return (
		<ChatFeatureFlagsContext.Provider value={{ realtimeEnabled, videoEnabled }}>
			{children}
		</ChatFeatureFlagsContext.Provider>
	);
}

export function useChatFeatureFlags(): ChatFeatureFlags {
	return useContext(ChatFeatureFlagsContext);
}
