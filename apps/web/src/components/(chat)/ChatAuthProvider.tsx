"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { InternalAuthHeaderData } from "@/lib/fetchers/internal/authTypes";
import { ChatStorageBoundary } from "./ChatStorageBoundary";
import { ChatPrivacyReviewBoundary } from "./ChatPrivacyReviewBoundary";

const ChatAuthContext = createContext<InternalAuthHeaderData | null>(null);

export function ChatAuthProvider({
	children,
	initialAuth,
}: {
	children: ReactNode;
	initialAuth: InternalAuthHeaderData;
}) {
	return (
		<ChatAuthContext.Provider value={initialAuth}>
			<ChatPrivacyReviewBoundary key={`${initialAuth.user?.id}:${initialAuth.currentTeamId}`} workspaceId={initialAuth.currentTeamId} signedIn={initialAuth.isLoggedIn}>
				<ChatStorageBoundary>{children}</ChatStorageBoundary>
			</ChatPrivacyReviewBoundary>
		</ChatAuthContext.Provider>
	);
}

export function useInitialChatAuth() {
	return useContext(ChatAuthContext);
}
