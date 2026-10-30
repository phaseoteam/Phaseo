"use client";

import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { MediaStudioRoom } from "@/components/(chat)/rooms/MediaStudioRoom";

type ImageStudioRoomProps = {
	models: GatewaySupportedModel[];
};

export function ImageStudioRoom({ models }: ImageStudioRoomProps) {
	return <MediaStudioRoom roomId="image" models={models} />;
}
