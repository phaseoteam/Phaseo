import {
	autoRoutingFlag,
	batchApiFlag,
	enterpriseSelfServePreviewEnabled,
	realtimeVoiceFlag,
	videoApiFlag,
} from "@/lib/flags";
import { catalogueGamesEnabled } from "@/lib/games/preview";
import { SearchWrapper } from "@/components/header/Search/SearchWrapper";

export async function SearchWithCapabilities(props: { className?: string; mobileGhost?: boolean }) {
	const [autoRouting, enterprise, webhooks, video, realtime, games] = await Promise.all([
		autoRoutingFlag().catch(() => false),
		enterpriseSelfServePreviewEnabled().catch(() => false),
		batchApiFlag().catch(() => false),
		videoApiFlag().catch(() => false),
		realtimeVoiceFlag().catch(() => false),
		catalogueGamesEnabled().catch(() => false),
	]);

	return <SearchWrapper {...props} capabilities={{ autoRouting, enterprise, webhooks, video, realtime, games }} />;
}
