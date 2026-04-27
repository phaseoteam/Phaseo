"use client";

import React from "react";
import {
	LogLevel,
	StatsigProvider,
	useStatsigUser,
	type StatsigUser,
} from "@statsig/react-bindings";
import { StatsigClient } from "@statsig/js-client";
import { StatsigSessionReplayPlugin } from "@statsig/session-replay";
import { StatsigAutoCapturePlugin } from "@statsig/web-analytics";

import { createClient as createSupabaseClient } from "@/utils/supabase/client";
import {
	ANALYTICS_CONSENT_EVENT,
	readAnalyticsConsent,
} from "@/lib/cookieConsent";
import {
	BETA_PROFILE_STORAGE_KEY,
	BETA_OPT_IN_STORAGE_KEY,
	BETA_PROFILE_CHANGED_EVENT,
	buildAnonymousStatsigUser,
	buildAuthenticatedStatsigUser,
	normalizeBetaFeatures,
	readStableIdCookie,
	readStoredBetaProfile,
	writeStableIdCookie,
	writeStoredBetaProfile,
} from "@/lib/statsig/shared";

function StatsigUserSync() {
	const { user, updateUserAsync } = useStatsigUser();

	React.useEffect(() => {
		if (user.customIDs?.stableID) {
			writeStableIdCookie(user.customIDs.stableID);
		}
	}, [user.customIDs?.stableID]);

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
			let profile = readStoredBetaProfile();

			try {
				const { data } = await supabase
					.from("users")
					.select("beta_opt_in, beta_features")
					.eq("user_id", authUser.id)
					.maybeSingle();

				profile = {
					betaOptIn: Boolean(data?.beta_opt_in),
					betaFeatures: normalizeBetaFeatures(data?.beta_features),
				};
				writeStoredBetaProfile(profile);
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
					profile
				)
			).catch(() => {
				// Keep current client state if user sync fails.
			});
		};

		const syncAnonymousUser = () => {
			const profile = readStoredBetaProfile();
			void updateUserAsync(
				buildAnonymousStatsigUser(stableID, {
					betaOptIn: profile.betaOptIn,
					betaFeatures: profile.betaFeatures,
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

		const syncBetaProfileFromStorage = () => {
			const profile = readStoredBetaProfile();
			void updateUserAsync((previous) => ({
				...previous,
				custom: {
					...(previous.custom ?? {}),
					betaOptIn: profile.betaOptIn,
					betaFeatureKeys: Object.keys(profile.betaFeatures).filter(
						(key) => profile.betaFeatures[key]
					),
				},
			})).catch(() => {
				// Keep current client state if beta profile sync fails.
			});
		};

		const onStorage = (event: StorageEvent) => {
			if (
				event.key !== BETA_OPT_IN_STORAGE_KEY &&
				event.key !== BETA_PROFILE_STORAGE_KEY
			) {
				return;
			}

			if (
				event.key === BETA_OPT_IN_STORAGE_KEY ||
				event.key === BETA_PROFILE_STORAGE_KEY
			) {
				syncBetaProfileFromStorage();
			}
		};

		window.addEventListener(BETA_PROFILE_CHANGED_EVENT, syncBetaProfileFromStorage);
		window.addEventListener("storage", onStorage);

		return () => {
			mounted = false;
			subscription.unsubscribe();
			window.removeEventListener(
				BETA_PROFILE_CHANGED_EVENT,
				syncBetaProfileFromStorage
			);
			window.removeEventListener("storage", onStorage);
		};
	}, [updateUserAsync, user.customIDs?.stableID]);

	return null;
}

function buildStatsigClient(
	clientKey: string,
	user: StatsigUser,
	values: string,
	analyticsConsent: "accepted" | "denied" | null
) {
	const analyticsEnabled = analyticsConsent === "accepted";
	const client = new StatsigClient(clientKey, user, {
		logLevel:
			process.env.NODE_ENV === "development" ? LogLevel.Debug : LogLevel.Warn,
		loggingEnabled: analyticsEnabled ? "browser-only" : "disabled",
		plugins: analyticsEnabled
			? [new StatsigAutoCapturePlugin(), new StatsigSessionReplayPlugin()]
			: [],
	});

	(client as any).dataAdapter.setData(values);
	client.initializeSync();
	return client;
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
	const [analyticsConsent, setAnalyticsConsent] =
		React.useState<"accepted" | "denied" | null>(() => readAnalyticsConsent());

	React.useEffect(() => {
		const syncConsent = () => setAnalyticsConsent(readAnalyticsConsent());

		window.addEventListener(
			ANALYTICS_CONSENT_EVENT,
			syncConsent as EventListener
		);
		window.addEventListener("storage", syncConsent);

		return () => {
			window.removeEventListener(
				ANALYTICS_CONSENT_EVENT,
				syncConsent as EventListener
			);
			window.removeEventListener("storage", syncConsent);
		};
	}, []);

	const client = React.useMemo(
		() => buildStatsigClient(clientKey, user, values, analyticsConsent),
		[clientKey, user, values, analyticsConsent]
	);

	return (
		<StatsigProvider client={client}>
			<StatsigUserSync />
			{children}
		</StatsigProvider>
	);
}
