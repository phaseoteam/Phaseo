import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import type { PublicLocale } from "@/i18n/routing";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { RealtimeRoom } from "@/components/(chat)/rooms/RealtimeRoom";
import { Badge } from "@/components/ui/badge";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { realtimeVoiceFlag } from "@/lib/flags";

type PageProps = {
	params: Promise<{ locale: PublicLocale }>;
};

type RealtimePageCopy = {
	title: string;
	beta: string;
	gatedTitle: string;
	gatedDescription: string;
};

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({
		title: t("realtimeRoom"),
		description: t("realtimeDescription"),
		path: "/chat/realtime",
		keywords: ["AI realtime", "voice chat", "Phaseo chat"],
	});
}

function RealtimeFlagDisabled({ copy }: { copy: RealtimePageCopy }) {
	return (
		<main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
			<header className="flex h-[57px] shrink-0 items-center justify-between border-b border-border px-4 md:px-6">
				<div className="flex min-w-0 items-center gap-2">
					<h1 className="truncate text-sm font-medium">{copy.title}</h1>
					<Badge variant="outline" className="text-[10px] uppercase">
						{copy.beta}
					</Badge>
				</div>
			</header>
			<section className="flex min-h-0 flex-1 items-center justify-center px-4">
				<div className="w-full max-w-lg rounded-2xl border border-border bg-background px-5 py-6 text-center shadow-sm">
					<h2 className="text-base font-semibold">{copy.gatedTitle}</h2>
					<p className="mt-2 text-sm leading-6 text-muted-foreground">
						{copy.gatedDescription}
					</p>
				</div>
			</section>
		</main>
	);
}

function RealtimeRoomLoading({ copy }: { copy: RealtimePageCopy }) {
	return (
		<main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
			<header className="flex h-[57px] shrink-0 items-center justify-between border-b border-border px-4 md:px-6">
				<div className="flex min-w-0 items-center gap-2">
					<h1 className="truncate text-sm font-medium">{copy.title}</h1>
					<Badge variant="outline" className="text-[10px] uppercase">
						{copy.beta}
					</Badge>
				</div>
			</header>
			<section className="flex min-h-0 flex-1 items-center justify-center px-4">
				<div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
			</section>
		</main>
	);
}

async function RealtimeRoomGate({ copy }: { copy: RealtimePageCopy }) {
	const enabled = await realtimeVoiceFlag();
	if (!enabled) return <RealtimeFlagDisabled copy={copy} />;
	const models = await fetchFrontendGatewayModels();
	return <RealtimeRoom models={models} />;
}

export default async function ChatRealtimePage({ params }: PageProps) {
	const { locale } = await params;
	const [tChat, tRooms, tBadges] = await Promise.all([
		getTranslations({ locale, namespace: "Product.chat" }),
		getTranslations({ locale, namespace: "Product.chatRooms" }),
		getTranslations({ locale, namespace: "Common.ui.status" }),
	]);
	const copy: RealtimePageCopy = {
		title: tChat("realtime"),
		beta: tBadges("beta"),
		gatedTitle: tRooms("realtimeFlagTitle"),
		gatedDescription: tRooms("realtimeFlagDescription"),
	};

	return (
		<RoomScaffold>
			<Suspense fallback={<RealtimeRoomLoading copy={copy} />}>
				<RealtimeRoomGate copy={copy} />
			</Suspense>
		</RoomScaffold>
	);
}
