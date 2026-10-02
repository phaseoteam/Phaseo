"use client";

import React, { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { forkPresetAction } from "@/app/(dashboard)/settings/presets/actions";

export default function CopyPresetButton({
	sourcePresetId,
	sourceVersionId,
}: {
	sourcePresetId: string;
	sourceVersionId?: string;
}) {
	const router = useRouter();
	const t = useTranslations("Product.gateway");
	const [isPending, startTransition] = useTransition();

	return (
		<Button
			variant="default"
			className="w-full rounded-md"
			disabled={isPending}
			onClick={() => {
				startTransition(async () => {
					try {
						const copied = await forkPresetAction(sourcePresetId, sourceVersionId);
						toast.success(t("presetCopied"), {
							action: copied.slug ? { label: t("openPreset"), onClick: () => router.push(`/settings/presets/${encodeURIComponent(copied.slug!)}`) } : { label: t("viewPresets"), onClick: () => router.push("/settings/presets") },
						});
					} catch (error) {
						const message = error instanceof Error ? error.message : "";
						if (message === "AUTH_REQUIRED") {
							router.push("/sign-in");
							return;
						}
						if (message === "TEAM_REQUIRED") {
							toast.error(t("selectTeamBeforeCopy"));
							return;
						}
						toast.error(t("copyPresetFailed"));
					}
				});
			}}
		>
			{isPending ? t("copyingPreset") : t("copyPresetButton")}
		</Button>
	);
}
