import type { Metadata } from "next";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { RealtimeRoom } from "@/components/(chat)/rooms/RealtimeRoom";
import { Badge } from "@/components/ui/badge";
import { realtimeVoiceFlag } from "@/lib/flags";

export const metadata: Metadata = buildMetadata({
	title: "Realtime Room - Phaseo Chat",
	description: "Realtime voice and multimodal conversation workspace.",
	path: "/chat/realtime",
	keywords: ["AI realtime", "voice chat", "Phaseo chat"],
});

function RealtimeFlagDisabled() {
	return (
		<main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
			<header className="flex h-[57px] shrink-0 items-center justify-between border-b border-border px-4 md:px-6">
				<div className="flex min-w-0 items-center gap-2">
					<h1 className="truncate text-sm font-medium">Realtime</h1>
					<Badge variant="outline" className="text-[10px] uppercase">
						Beta
					</Badge>
				</div>
			</header>
			<section className="flex min-h-0 flex-1 items-center justify-center px-4">
				<div className="w-full max-w-lg rounded-lg border border-border bg-background px-5 py-6 text-center shadow-sm">
					<h2 className="text-base font-semibold">Realtime voice is gated</h2>
					<p className="mt-2 text-sm leading-6 text-muted-foreground">
						Realtime voice is not enabled for this account yet.
					</p>
				</div>
			</section>
		</main>
	);
}

function RealtimeRoomLoading() {
	return (
		<main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
			<header className="flex h-[57px] shrink-0 items-center justify-between border-b border-border px-4 md:px-6">
				<div className="flex min-w-0 items-center gap-2">
					<h1 className="truncate text-sm font-medium">Realtime</h1>
					<Badge variant="outline" className="text-[10px] uppercase">
						Beta
					</Badge>
				</div>
			</header>
			<section className="flex min-h-0 flex-1 items-center justify-center px-4">
				<div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
			</section>
		</main>
	);
}

async function RealtimeRoomGate() {
	const enabled = await realtimeVoiceFlag();
	if (!enabled) return <RealtimeFlagDisabled />;
	const models = await fetchFrontendGatewayModels();
	return <RealtimeRoom models={models} />;
}

export default function ChatRealtimePage() {
	return (
		<RoomScaffold>
			<Suspense fallback={<RealtimeRoomLoading />}>
				<RealtimeRoomGate />
			</Suspense>
		</RoomScaffold>
	);
}
