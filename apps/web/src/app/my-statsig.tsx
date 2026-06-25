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

import { fetchClientAuthStatsigData } from "@/lib/fetchers/internal/fetchClientAuthStatsigData";
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

		let mounted = true;

		const syncAuthenticatedUser = async (
			authUser: {
				id: string;
				email?: string | null;
			},
			profile = readStoredBetaProfile()
		) => {
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

		const syncCurrentUser = async () => {
			try {
				const data = await fetchClientAuthStatsigData();
				if (!mounted) return;

				if (data.signedIn && data.user) {
					writeStoredBetaProfile(data.profile);
					await syncAuthenticatedUser(data.user, data.profile);
					return;
				}

				syncAnonymousUser();
			} catch {
				if (mounted) {
					syncAnonymousUser();
				}
			}
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

		void syncCurrentUser();

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
			window.removeEventListener(
				BETA_PROFILE_CHANGED_EVENT,
				syncBetaProfileFromStorage
			);
			window.removeEventListener("storage", onStorage);
		};
	}, [updateUserAsync, user.customIDs?.stableID]);

	return null;
}

async function buildStatsigClient(
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

	await (client as any).dataAdapter.setData(values);
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

	const [client, setClient] = React.useState<StatsigClient | null>(null);

	React.useEffect(() => {
		let active = true;

		void buildStatsigClient(clientKey, user, values, analyticsConsent)
			.then((nextClient) => {
				if (active) {
					setClient(nextClient);
				}
			})
			.catch((error) => {
				console.error("Failed to initialize Statsig client", error);
			});

		return () => {
			active = false;
		};
	}, [clientKey, user, values, analyticsConsent]);

	if (!client) {
		return null;
	}

	return (
		<StatsigProvider client={client}>
			<StatsigUserSync />
			{children}
		</StatsigProvider>
	);
}
