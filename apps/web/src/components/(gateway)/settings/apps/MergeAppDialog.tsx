"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { mergeAppsAction } from "@/app/(dashboard)/settings/apps/actions";

type AppItem = {
	id: string;
	title: string;
	url: string | null;
};

type MergeAppDialogProps = {
	app: AppItem;
	apps: AppItem[];
	disabled?: boolean;
	onMerged: () => void;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	hideTrigger?: boolean;
	trigger?: React.ReactNode;
};

export default function MergeAppDialog({
	app,
	apps,
	disabled,
	onMerged,
	open: openProp,
	onOpenChange,
	hideTrigger,
	trigger,
}: MergeAppDialogProps) {
	const [internalOpen, setInternalOpen] = useState(false);
	const [targetId, setTargetId] = useState<string>("");
	const [loading, setLoading] = useState(false);
	const isControlled = typeof openProp === "boolean";
	const open = isControlled ? openProp : internalOpen;
	const setOpen = (next: boolean) => {
		if (isControlled) {
			onOpenChange?.(next);
		} else {
			setInternalOpen(next);
		}
	};

	const options = useMemo(
		() => apps.filter((candidate) => candidate.id !== app.id),
		[apps, app.id]
	);

	const onMerge = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!targetId) return;
		setLoading(true);
		try {
			await toast.promise(mergeAppsAction(app.id, targetId), {
				loading: "Merging apps...",
				success: "Apps merged",
				error: (err) => err?.message ?? "Failed to merge apps",
			});
			onMerged();
			setOpen(false);
		} finally {
			setLoading(false);
		}
	};

	if (!options.length) {
		if (hideTrigger) return null;
		return (
			<Button variant="outline" size="sm" disabled>
				Merge
			</Button>
		);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{!hideTrigger ? (
				<DialogTrigger asChild>
					{trigger ?? (
						<Button variant="outline" size="sm" disabled={disabled}>
							Merge
						</Button>
					)}
				</DialogTrigger>
			) : null}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Merge apps</DialogTitle>
					<DialogDescription>
						Move all requests from this app into another and remove the source
						afterwards.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onMerge} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="merge-target">Merge into</Label>
						<Select value={targetId} onValueChange={setTargetId}>
							<SelectTrigger id="merge-target">
								<SelectValue placeholder="Choose target app" />
							</SelectTrigger>
							<SelectContent>
								{options.map((option) => (
									<SelectItem key={option.id} value={option.id}>
										{option.title}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
						This will move all historical requests to the selected app and
						delete "{app.title}".
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={loading || !targetId}>
							{loading ? "Merging..." : "Merge app"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
