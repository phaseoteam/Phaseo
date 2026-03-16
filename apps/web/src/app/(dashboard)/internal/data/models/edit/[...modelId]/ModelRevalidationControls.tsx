"use client";

import { useState, useTransition } from "react";
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
					const result = await revalidateSingleModelDataAction(modelId);
					setMessage(result.message);
					return;
				}
				if (scope === "api") {
					const result = await revalidateSingleModelApiInfoAction(modelId);
					setMessage(result.message);
					return;
				}
				const result = await revalidateSingleModelAllAction(modelId);
				setMessage(result.message);
			} catch (actionError) {
				setError(
					actionError instanceof Error
						? actionError.message
						: "Failed to revalidate model cache."
				);
			} finally {
				setRunningScope(null);
			}
		});
	};

	const isBusy = (scope: RefreshScope) => isPending && runningScope === scope;

	return (
		<div className="rounded-lg border p-4 space-y-3">
			<div>
				<h2 className="text-sm font-medium">Cache controls</h2>
				<p className="text-xs text-muted-foreground">
					Revalidate this model across the site by scope.
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					variant="outline"
					onClick={() => runAction("data")}
					disabled={isPending}
				>
					{isBusy("data") ? "Revalidating data..." : "Revalidate Data"}
				</Button>
				<Button
					type="button"
					variant="outline"
					onClick={() => runAction("api")}
					disabled={isPending}
				>
					{isBusy("api") ? "Revalidating API info..." : "Revalidate API Info"}
				</Button>
				<Button
					type="button"
					onClick={() => runAction("all")}
					disabled={isPending}
				>
					{isBusy("all") ? "Revalidating all..." : "Revalidate Everything"}
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
