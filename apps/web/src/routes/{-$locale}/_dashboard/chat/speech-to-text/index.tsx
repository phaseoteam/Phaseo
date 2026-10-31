import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import SpeechToTextChatPage, { getSpeechToTextChatMetadata } from "@/features/chat/speech-to-text/SpeechToTextChatPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getSpeechToTextChatMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/chat/speech-to-text/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: SpeechToTextChatPage,
});
