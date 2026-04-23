"use client";

import React from "react";
import {
	LogLevel,
	StatsigProvider,
	useClientBootstrapInit,
	useStatsigUser,
	type StatsigUser,
} from "@statsig/react-bindings";
import { StatsigSessionReplayPlugin } from "@statsig/session-replay";
import { StatsigAutoCapturePlugin } from "@statsig/web-analytics";

import { createClient as createSupabaseClient } from "@/utils/supabase/client";
import {
	BETA_OPT_IN_CHANGED_EVENT,
	BETA_OPT_IN_STORAGE_KEY,
	buildAnonymousStatsigUser,
	buildAuthenticatedStatsigUser,
	normalizeBetaFeatures,
	readStableIdCookie,
	readStoredBetaOptIn,
	writeStableIdCookie,
	writeStoredBetaOptIn,
} from "@/lib/statsig/shared";

function StatsigUserSync() {
	const { user, updateUserAsync } = useStatsigUser();

	React.useEffect(() => {
		if (user.customIDs?.stableID) {
			writeStableIdCookie(user.customIDs.stableID);
		}

		if (typeof user.custom?.betaOptIn === "boolean") {
			writeStoredBetaOptIn(Boolean(user.custom.betaOptIn));
		}
	}, [user.custom?.betaOptIn, user.customIDs?.stableID]);

	React.useEffect(() => {
		const stableID =
			readStableIdCookie() ??
			user.customIDs?.stableID ??
			(typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
				? crypto.randomUUID()
				: `statsig-${Math.random().toString(36).slice(2, 11)}`);

		writeStableIdCookie(stableID);

		const supabase = createSupabaseClient();
		let mounted = true;

		const syncAuthenticatedUser = async (authUser: {
			id: string;
			email?: string | null;
		}) => {
			let betaOptIn = readStoredBetaOptIn();
			let betaFeatures: Record<string, unknown> = {};

			try {
				const { data } = await supabase
					.from("users")
					.select("beta_opt_in, beta_features")
					.eq("user_id", authUser.id)
					.maybeSingle();

				betaOptIn = Boolean(data?.beta_opt_in);
				betaFeatures = normalizeBetaFeatures(data?.beta_features);
				writeStoredBetaOptIn(betaOptIn);
			} catch {
				// Keep previous client-side values when profile fetch fails.
			}

			if (!mounted) return;

			void updateUserAsync(
				buildAuthenticatedStatsigUser(
					{
						id: authUser.id,
						email: authUser.email,
					},
					stableID,
					{
						betaOptIn,
						betaFeatures,
					}
				)
			).catch(() => {
				// Keep current client state if user sync fails.
			});
		};

		const syncAnonymousUser = () => {
			void updateUserAsync(
				buildAnonymousStatsigUser(stableID, {
					betaOptIn: readStoredBetaOptIn(),
				})
			).catch(() => {
				// Keep current client state if anonymous sync fails.
			});
		};

		void supabase.auth
			.getUser()
			.then(async ({ data }) => {
				if (data.user?.id) {
					await syncAuthenticatedUser({
						id: data.user.id,
						email: data.user.email,
					});
					return;
				}

				if (mounted) {
					syncAnonymousUser();
				}
			})
			.catch(() => {
				if (mounted) {
					syncAnonymousUser();
				}
			});

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange(async (_event, session) => {
			if (session?.user?.id) {
				await syncAuthenticatedUser({
					id: session.user.id,
					email: session.user.email,
				});
				return;
			}

			if (mounted) {
				syncAnonymousUser();
			}
		});

		const syncBetaFlagFromStorage = () => {
			const betaOptIn = readStoredBetaOptIn();
			void updateUserAsync((previous) => ({
				...previous,
				custom: {
					...(previous.custom ?? {}),
					betaOptIn,
				},
			})).catch(() => {
				// Keep current client state if beta flag sync fails.
			});
		};

		const onStorage = (event: StorageEvent) => {
			if (event.key !== BETA_OPT_IN_STORAGE_KEY) return;
			syncBetaFlagFromStorage();
		};

		window.addEventListener(BETA_OPT_IN_CHANGED_EVENT, syncBetaFlagFromStorage);
		window.addEventListener("storage", onStorage);

		return () => {
			mounted = false;
			subscription.unsubscribe();
			window.removeEventListener(
				BETA_OPT_IN_CHANGED_EVENT,
				syncBetaFlagFromStorage
			);
			window.removeEventListener("storage", onStorage);
		};
	}, [updateUserAsync, user.customIDs?.stableID]);

	return null;
}

export default function MyStatsig({
	children,
	clientKey,
	user,
	values,
}: {
	children: React.ReactNode;
	clientKey: string;
	user: StatsigUser;
	values: string;
}) {
	const options = React.useMemo(
		() => ({
			logLevel: LogLevel.Debug,
			plugins: [
				new StatsigAutoCapturePlugin(),
				new StatsigSessionReplayPlugin(),
			],
		}),
		[]
	);

	const client = useClientBootstrapInit(clientKey, user, values, options);

	return (
		<StatsigProvider client={client}>
			<StatsigUserSync />
			{children}
		</StatsigProvider>
	);
}
