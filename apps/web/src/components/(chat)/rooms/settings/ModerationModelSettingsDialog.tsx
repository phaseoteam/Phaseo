"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	RoomModelSettingsShell,
} from "@/components/(chat)/rooms/settings/RoomModelSettingsShell";
import type {
	RoomBaseModelSettings,
	RoomModelProfile,
} from "@/components/(chat)/rooms/useRoomModelSettings";
import type { ModerationRoomParams } from "@/lib/chat/roomModelSettings";

type ModerationModelSettingsDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	settings: RoomModelProfile<ModerationRoomParams>;
	modelChoices: Array<{
		id: string;
		label: string;
		orgId: string;
		orgName: string;
	}>;
	selectedModelId?: string | null;
	onModelChange: (modelId: string) => void;
	providerOptions: Array<{ id: string; name: string }>;
	supportedProvidersForModel?: string[];
	onUpdateBase: (partial: Partial<RoomBaseModelSettings>) => void;
	onUpdateParams: (partial: Partial<ModerationRoomParams>) => void;
	onReset: () => void;
};

export function ModerationModelSettingsDialog({
	open,
	onOpenChange,
	settings,
	modelChoices,
	selectedModelId,
	onModelChange,
	providerOptions,
	supportedProvidersForModel,
	onUpdateBase,
	onUpdateParams,
	onReset,
}: ModerationModelSettingsDialogProps) {
	return (
		<RoomModelSettingsShell
			open={open}
			onOpenChange={onOpenChange}
			title="Moderation model settings"
			description="Configure moderation defaults for this model."
			settings={settings}
			modelChoices={modelChoices}
			selectedModelId={selectedModelId}
			onModelChange={onModelChange}
			providerOptions={providerOptions}
			supportedProvidersForModel={supportedProvidersForModel}
			onUpdateBase={onUpdateBase}
			onReset={onReset}
		>
			<div className="grid gap-3">
				<div className="grid gap-1.5">
					<Label htmlFor="score-threshold">Local flag threshold (0-1)</Label>
					<Input
						id="score-threshold"
						type="number"
						min={0}
						max={1}
						step={0.01}
						value={settings.params.scoreThreshold}
						onChange={(event) =>
							onUpdateParams({
								scoreThreshold: Math.max(
									0,
									Math.min(1, Number(event.target.value) || 0.5),
								),
							})
						}
					/>
				</div>
				<p className="text-xs text-muted-foreground">
					If any category score meets this threshold, the entry is marked flagged in
					the room UI.
				</p>
			</div>
		</RoomModelSettingsShell>
	);
}
