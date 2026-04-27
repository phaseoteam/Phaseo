"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { forkPresetAction } from "@/app/(dashboard)/settings/presets/actions";

export default function CopyPresetButton({
	sourcePresetId,
}: {
	sourcePresetId: string;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	return (
		<Button
			variant="default"
			disabled={isPending}
			onClick={() => {
				startTransition(async () => {
					try {
						await forkPresetAction(sourcePresetId);
						toast.success("Preset copied to your account");
						router.push("/settings/presets");
						router.refresh();
					} catch (error) {
						const message = error instanceof Error ? error.message : "";
						if (message === "AUTH_REQUIRED") {
							router.push("/sign-in");
							return;
						}
						if (message === "TEAM_REQUIRED") {
							toast.error("Select a team before copying a preset.");
							return;
						}
						toast.error(message || "Failed to copy preset");
					}
				});
			}}
		>
			{isPending ? "Copying..." : "Copy to my presets"}
		</Button>
	);
}
