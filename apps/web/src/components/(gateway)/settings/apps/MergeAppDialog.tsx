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
import { useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";

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
	const t = useTranslations("SettingsUI");
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
				loading: t("strings.Merging apps..." as never),
				success: t("strings.Apps merged" as never),
				error: (err) =>
					localizedSettingsError(err, t, "Failed to merge apps"),
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
					{t("strings.Merge" as never)}
			</Button>
		);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{!hideTrigger ? (
				<DialogTrigger asChild>
					{trigger ?? (
						<Button variant="outline" size="sm" disabled={disabled}>
										{t("strings.Merge" as never)}
						</Button>
					)}
				</DialogTrigger>
			) : null}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("strings.Merge apps" as never)}</DialogTitle>
					<DialogDescription>
						{t("strings.Move all requests from this app into another and remove the source afterwards." as never)}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onMerge} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="merge-target">{t("strings.Merge into" as never)}</Label>
						<Select value={targetId} onValueChange={setTargetId}>
							<SelectTrigger id="merge-target">
								<SelectValue placeholder={t("strings.Choose target app" as never)} />
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
						{(t as unknown as (key: string, values?: Record<string, string>) => string)("strings.This will move all historical requests to the selected app and delete {appName}.", { appName: app.title })}
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
							{t("strings.Cancel" as never)}
						</Button>
						<Button type="submit" disabled={loading || !targetId}>
							{loading ? t("strings.Merging..." as never) : t("strings.Merge app" as never)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
