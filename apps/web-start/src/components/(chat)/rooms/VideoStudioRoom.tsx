"use client";

import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { MediaStudioRoom } from "@/components/(chat)/rooms/MediaStudioRoom";

type VideoStudioRoomProps = {
	models: GatewaySupportedModel[];
};

export function VideoStudioRoom({ models }: VideoStudioRoomProps) {
	return <MediaStudioRoom roomId="video" models={models} />;
}
