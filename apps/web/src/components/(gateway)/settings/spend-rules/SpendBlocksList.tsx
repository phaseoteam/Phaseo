"use client";

import { useState } from "react";
import { ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import type { SettingsSpendRuleOptions } from "@/lib/fetchers/internal/settingsTypes";
import { liftSpendBlock } from "@/app/(dashboard)/settings/notifications/spend-rules-actions";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import { useSpendActionError } from "./SpendRuleEditorSheet";
import { useScopeLabel, useSpendUsd } from "./spendAlertsUi";
import type { SpendBlock } from "./spendRules";

/**
 * Active spend blocks, above the rule list: what is blocked, by which rule, how far spend went
 * and when the block resets. Owners and admins can lift one; it then stays lifted until the
 * rule's period resets. Renders nothing when no block is active.
 */
export function SpendBlocksList({ blocks, canManage, options, maxRules }: {
	blocks: SpendBlock[];
	canManage: boolean;
	options: SettingsSpendRuleOptions;
	maxRules: number;
}) {
	const t = useTranslations("SettingsUI.spendAlerts");
	const format = useDisplayFormatters();
	const usd = useSpendUsd();
	const scopeLabel = useScopeLabel(options);
	const [lifting, setLifting] = useState<SpendBlock | null>(null);
	const active = blocks.filter((block) => block.active);
	if (!active.length) return null;
	const when = (iso: string) => format.dateParts(iso, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

	return (
		<div className="space-y-3">
			<div>
				<h3 className="text-sm font-medium">{t("blocks.title")}</h3>
				<p className="mt-0.5 text-sm text-muted-foreground">{t("blocks.description")}</p>
			</div>
			<ul className="divide-y divide-red-200 rounded-md border border-red-200 bg-red-50 dark:divide-red-900/60 dark:border-red-900/60 dark:bg-red-950/20">
				{active.map((block) => (
					<li key={block.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-center gap-2">
								<span className="truncate text-sm font-medium">{block.rule_name ?? t("blocks.deletedRule")}</span>
								<Badge variant="destructive" className="rounded-md">{t("blocks.badge")}</Badge>
								{block.block_free_models ? null : <Badge variant="outline" className="rounded-md">{t("blocks.freeModelsAllowed")}</Badge>}
							</div>
							<p className="mt-0.5 truncate text-sm text-muted-foreground">
								{[
									block.scope_type === "member" || block.scope_type === "model" ? t(`scopeLabel.${block.scope_type}`, { name: block.scope_label }) : scopeLabel(block.scope_type, block.scope_id),
									t("blocks.spent", { spend: usd(block.spend_usd), limit: usd(block.limit_usd) }),
								].join(" · ")}
							</p>
							<p className="mt-0.5 text-xs text-muted-foreground">
								{[
									block.resets_at ? t("blocks.resets", { date: when(block.resets_at) }) : t("blocks.noReset"),
									t("blocks.since", { date: when(block.started_at) }),
								].join(" · ")}
							</p>
						</div>
						{canManage ? (
							<Button type="button" variant="outline" className="shrink-0 self-end rounded-md sm:self-auto" onClick={() => setLifting(block)}>
								<ShieldOff className="size-4" />{t("blocks.lift")}
							</Button>
						) : null}
					</li>
				))}
			</ul>
			<p className="text-xs text-muted-foreground">{t("blocks.bestEffort")}</p>
			<LiftSpendBlockDialog block={lifting} maxRules={maxRules} onClose={() => setLifting(null)} />
		</div>
	);
}

function LiftSpendBlockDialog({ block, maxRules, onClose }: { block: SpendBlock | null; maxRules: number; onClose: () => void }) {
	const t = useTranslations("SettingsUI.spendAlerts");
	const write = useSettingsWrite();
	const actionError = useSpendActionError();
	const [lifting, setLifting] = useState(false);

	async function confirm() {
		if (!block) return;
		setLifting(true);
		const result = await write(liftSpendBlock(block.id));
		setLifting(false);
		if (result.ok === false) {
			toast.error(result.code === "spend_block_not_active" ? t("blocks.alreadyLifted") : actionError(result, maxRules));
			if (result.code === "spend_block_not_active") onClose();
			return;
		}
		toast.success(t("toast.lifted"));
		onClose();
	}

	return (
		<AlertDialog open={block !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
			<AlertDialogContent className="rounded-md">
				<AlertDialogHeader>
					<AlertDialogTitle>{t("blocks.liftTitle", { name: block?.rule_name ?? t("blocks.deletedRule") })}</AlertDialogTitle>
					<AlertDialogDescription>{t("blocks.liftBody")}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel className="rounded-md" disabled={lifting}>{t("delete.cancel")}</AlertDialogCancel>
					<AlertDialogAction variant="destructive" className="rounded-md" disabled={lifting} onClick={() => void confirm()}>
						{lifting ? t("blocks.lifting") : t("blocks.liftConfirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
