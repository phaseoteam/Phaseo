import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { useSuspenseQuery } from "@tanstack/react-query";
import { chatGatewayModelsOrFailureQuery } from "@/features/chat/chat.queries";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { AudioRoom } from "@/components/(chat)/rooms/AudioRoom";

export async function getMusicChatMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({ title: t("music"), description: t("musicDescription"), path: "/chat/music", keywords: ["AI music", "music generation", "Phaseo chat"] });
}

export default function ChatMusicPage() {
	return <Suspense fallback={null}><ChatMusicContent /></Suspense>;
}

function ChatMusicContent() {
	const { data: { models, failed: modelsLoadFailed } } = useSuspenseQuery(chatGatewayModelsOrFailureQuery());
	return (
		<RoomScaffold>
			<AudioRoom
				models={models}
				modelsLoadFailed={modelsLoadFailed}
				roomId="music"
				initialMode="music"
				allowedModes={["music"]}
			/>
		</RoomScaffold>
	);
}
