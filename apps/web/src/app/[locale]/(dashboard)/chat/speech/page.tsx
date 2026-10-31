import type { Metadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { useSuspenseQuery } from "@tanstack/react-query";
import { chatGatewayModelsQuery } from "@/app/[locale]/(dashboard)/chat/chat.queries";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { AudioRoom } from "@/components/(chat)/rooms/AudioRoom";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({ title: t("speech"), description: t("speechDescription"), path: "/chat/speech", keywords: ["AI speech", "text to speech", "Phaseo chat"] });
}

export default function ChatSpeechPage() {
	return <Suspense fallback={null}><ChatSpeechContent /></Suspense>;
}

function ChatSpeechContent() {
	const { data: models } = useSuspenseQuery(chatGatewayModelsQuery());
	return (
		<RoomScaffold>
			<AudioRoom
				models={models}
				roomId="speech"
				initialMode="speech"
				allowedModes={["speech"]}
			/>
		</RoomScaffold>
	);
}
