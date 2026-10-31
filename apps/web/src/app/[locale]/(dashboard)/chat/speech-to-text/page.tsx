import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { useSuspenseQuery } from "@tanstack/react-query";
import { chatGatewayModelsQuery } from "@/app/[locale]/(dashboard)/chat/chat.queries";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { AudioRoom } from "@/components/(chat)/rooms/AudioRoom";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({ title: t("speechToText"), description: t("speechToTextDescription"), path: "/chat/speech-to-text", keywords: ["AI transcription", "speech to text", "Phaseo chat"] });
}

export default function ChatSpeechToTextPage() {
	return <Suspense fallback={null}><ChatSpeechToTextContent /></Suspense>;
}

function ChatSpeechToTextContent() {
	const { data: models } = useSuspenseQuery(chatGatewayModelsQuery());
	return (
		<RoomScaffold>
			<AudioRoom
				models={models}
				roomId="speech-to-text"
				initialMode="transcription"
				allowedModes={["transcription"]}
			/>
		</RoomScaffold>
	);
}
