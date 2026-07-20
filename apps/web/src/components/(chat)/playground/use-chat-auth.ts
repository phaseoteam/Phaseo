import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { fetchClientAuthHeaderData } from "@/lib/fetchers/internal/fetchClientAuthHeaderData";

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
	const [authUser, setAuthUser] = useState<ChatUser | null>(null);
	const [userRole, setUserRole] = useState<string | null>(null);
	const [authLoading, setAuthLoading] = useState(true);

	useEffect(() => {
		if (shouldBypassAuthForChatPerformance()) {
			setAuthUser(CHAT_PERF_TEST_USER);
			setUserRole("admin");
			setAuthLoading(false);
			return;
		}
		let mounted = true;
		const supabase = createClient();
		const loadUser = async () => {
			setAuthLoading(true);
			const { data, error } = await supabase.auth.getUser();
			if (!mounted) return;
			if (error || !data.user) {
				setAuthUser(null);
				setUserRole(null);
				setAuthLoading(false);
				return;
			}
			const profile = await fetchClientAuthHeaderData();
			if (!mounted) return;
			const displayName =
				profile.user?.displayName ??
				data.user.user_metadata?.full_name ??
				data.user.user_metadata?.name ??
				data.user.email ??
				"Account";
			setAuthUser({
				id: data.user.id,
				email: data.user.email ?? null,
				name: displayName,
				avatarUrl: data.user.user_metadata?.avatar_url ?? null,
			});
			setUserRole(profile.userRole ?? null);
			setAuthLoading(false);
		};
		loadUser();
		const { data: listener } = supabase.auth.onAuthStateChange(() => {
			loadUser();
		});
		return () => {
			mounted = false;
			listener.subscription.unsubscribe();
		};
	}, []);

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
