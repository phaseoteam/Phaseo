"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
	revalidateSingleModelAllAction,
	revalidateSingleModelApiInfoAction,
	revalidateSingleModelDataAction,
} from "@/app/(dashboard)/internal/data/actions";

type Props = {
	modelId: string;
};

type RefreshScope = "data" | "api" | "all";

export default function ModelRevalidationControls({ modelId }: Props) {
	const t = useTranslations("Product.internalTools.dataEditor");
	const [isPending, startTransition] = useTransition();
	const [runningScope, setRunningScope] = useState<RefreshScope | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const runAction = (scope: RefreshScope) => {
		setError(null);
		setMessage(null);
		setRunningScope(scope);

		startTransition(async () => {
			try {
				if (scope === "data") {
					await revalidateSingleModelDataAction(modelId);
					setMessage(t("cacheRevalidatedData"));
					return;
				}
				if (scope === "api") {
					await revalidateSingleModelApiInfoAction(modelId);
					setMessage(t("cacheRevalidatedApiInfo"));
					return;
				}
				await revalidateSingleModelAllAction(modelId);
				setMessage(t("cacheRevalidatedAll"));
			} catch (actionError) {
				console.error("Failed to revalidate model cache", actionError);
				setError(t("cacheFailure"));
			} finally {
				setRunningScope(null);
			}
		});
	};

	const isBusy = (scope: RefreshScope) => isPending && runningScope === scope;

	return (
		<div className="rounded-lg border p-4 space-y-3">
			<div>
				<h2 className="text-sm font-medium">{t("cacheControls")}</h2>
				<p className="text-xs text-muted-foreground">
					{t("cacheControlsDescription")}
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					variant="outline"
					onClick={() => runAction("data")}
					disabled={isPending}
				>
					{isBusy("data") ? t("revalidatingData") : t("revalidateData")}
				</Button>
				<Button
					type="button"
					variant="outline"
					onClick={() => runAction("api")}
					disabled={isPending}
				>
					{isBusy("api") ? t("revalidatingApiInfo") : t("revalidateApiInfo")}
				</Button>
				<Button
					type="button"
					onClick={() => runAction("all")}
					disabled={isPending}
				>
					{isBusy("all") ? t("revalidatingAll") : t("revalidateAll")}
				</Button>
			</div>
			{message ? (
				<p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-700">
					{message}
				</p>
			) : null}
			{error ? (
				<p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
					{error}
				</p>
			) : null}
		</div>
	);
}
