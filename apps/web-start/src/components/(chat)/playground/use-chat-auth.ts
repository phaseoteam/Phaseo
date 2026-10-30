import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useInitialChatAuth } from "@/components/(chat)/ChatAuthProvider";

export type ChatUser = {
	id: string;
	email: string | null;
	name: string;
	avatarUrl: string | null;
};

const CHAT_PERF_TEST_USER: ChatUser = {
	id: "chat-performance-test-user",
	email: "chat-performance@example.test",
	name: "Chat Performance Test",
	avatarUrl: null,
};

function shouldBypassAuthForChatPerformance() {
	return (
		process.env.NODE_ENV !== "production" &&
		typeof window !== "undefined" &&
		new URLSearchParams(window.location.search).get("chatPerfAuth") === "1"
	);
}

export function useChatAuth() {
	const initialAuth = useInitialChatAuth();
	const initialUser = initialAuth?.isLoggedIn && initialAuth.user
		? {
				id: initialAuth.user.id,
				email: initialAuth.user.email,
				name:
					initialAuth.user.displayName ??
					initialAuth.user.email ??
					"Account",
				avatarUrl: initialAuth.user.avatarUrl,
			} satisfies ChatUser
		: null;
	const [authUser, setAuthUser] = useState<ChatUser | null>(initialUser);
	const [userRole, setUserRole] = useState<string | null>(
		initialAuth?.userRole ?? null,
	);
	const [authLoading, setAuthLoading] = useState(false);

	useEffect(() => {
		if (shouldBypassAuthForChatPerformance()) {
			setAuthUser(CHAT_PERF_TEST_USER);
			setUserRole("admin");
			setAuthLoading(false);
			return;
		}
		const supabase = createClient();
		const { data: listener } = supabase.auth.onAuthStateChange((event) => {
			if (event === "SIGNED_OUT") {
				setAuthUser(null);
				setUserRole(null);
			}
			if (event === "SIGNED_IN" && !initialAuth?.isLoggedIn) {
				window.location.reload();
			}
		});
		return () => {
			listener.subscription.unsubscribe();
		};
	}, [initialAuth?.isLoggedIn]);

	const handleSignOut = useCallback(async () => {
		const supabase = createClient();
		await supabase.auth.signOut();
		setAuthUser(null);
		setUserRole(null);
		window.location.href = "/sign-in";
	}, []);

	return {
		authLoading,
		authUser,
		handleSignOut,
		isAdmin: userRole === "admin",
		isAuthenticated: Boolean(authUser),
		userRole,
	};
}
