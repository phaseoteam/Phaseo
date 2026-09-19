import {
	autoRoutingFlag,
	batchApiFlag,
	enterpriseSelfServePreviewEnabled,
	realtimeVoiceFlag,
	videoApiFlag,
} from "@/lib/flags";
import { catalogueGamesEnabled } from "@/lib/games/preview";
import { SearchWrapper } from "@/components/header/Search/SearchWrapper";
import { connection } from "next/server";
import { fetchInternalAuthHeaderData } from "@/lib/fetchers/internal/fetchInternalAuthHeaderData";
import { toAccountQueryScope } from "@/lib/query/queryKeys";

export async function SearchWithCapabilities(props: { className?: string; mobileGhost?: boolean }) {
	// Capability flags can consult request-scoped clients which read the clock.
	// Explicitly opt this boundary into request time so Cache Components does not
	// attempt to evaluate those values during prerendering.
	await connection();
	const [autoRouting, enterprise, webhooks, video, realtime, games, authHeader] = await Promise.all([
		autoRoutingFlag().catch(() => false),
		enterpriseSelfServePreviewEnabled().catch(() => false),
		batchApiFlag().catch(() => false),
		videoApiFlag().catch(() => false),
		realtimeVoiceFlag().catch(() => false),
		catalogueGamesEnabled().catch(() => false),
		fetchInternalAuthHeaderData().catch(() => null),
	]);

	return (
		<SearchWrapper
			{...props}
			capabilities={{ autoRouting, enterprise, webhooks, video, realtime, games }}
			accountQueryScope={toAccountQueryScope({
				userId: authHeader?.user?.id,
				workspaceId: authHeader?.currentTeamId,
			})}
		/>
	);
}
