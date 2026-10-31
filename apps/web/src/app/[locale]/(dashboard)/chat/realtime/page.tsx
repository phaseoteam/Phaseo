import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useLocale, useTranslations } from "next-intl";
import { Suspense } from "react";
import type { PublicLocale } from "@/i18n/routing";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { RealtimeRoom } from "@/components/(chat)/rooms/RealtimeRoom";
import { Badge } from "@/components/ui/badge";
import { buildMetadata } from "@/lib/seo";
import { useSuspenseQuery } from "@tanstack/react-query";
import { chatGatewayModelsQuery } from "@/app/[locale]/(dashboard)/chat/chat.queries";
import { shellDataQuery } from "@/components/header/shellData";

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

function RealtimeRoomGate({ copy }: { copy: RealtimePageCopy }) {
	// The realtime flag is resolved server-side with the site-shell data.
	const locale = useLocale();
	const { data: shellData } = useSuspenseQuery(shellDataQuery(locale));
	const enabled = shellData.capabilities.realtime;
	if (!enabled) return <RealtimeFlagDisabled copy={copy} />;
	return <RealtimeRoomWithModels />;
}

function RealtimeRoomWithModels() {
	const { data: models } = useSuspenseQuery(chatGatewayModelsQuery());
	return <RealtimeRoom models={models} />;
}

// The locale comes from the intl provider, which follows the route's locale param.
export default function ChatRealtimePage(_props: PageProps) {
	const tChat = useTranslations("Product.chat");
	const tRooms = useTranslations("Product.chatRooms");
	const tBadges = useTranslations("Common.ui.status");
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
