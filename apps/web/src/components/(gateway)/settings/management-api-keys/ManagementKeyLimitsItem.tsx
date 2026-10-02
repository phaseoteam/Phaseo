"use client";
import { localizedSettingsError } from "@/i18n/error-messages";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogClose,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Settings, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
	updateManagementKeyLimitsAction,
	ManagementKeyLimitPayload,
} from "@/app/(dashboard)/settings/management-api-keys/actions";
type KeyLimitPayload = ManagementKeyLimitPayload;
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";

export default function ManagementKeyLimitsItem({ k }: any) {
	const t = useTranslations("SettingsUI");
	const [open, setOpen] = useState(false);
	const [dailyRequests, setDailyRequests] = useState(
		k.daily_limit_requests?.toString() || ""
	);
	const [weeklyRequests, setWeeklyRequests] = useState(
		k.weekly_limit_requests?.toString() || ""
	);
	const [monthlyRequests, setMonthlyRequests] = useState(
		k.monthly_limit_requests?.toString() || ""
	);
	const [loading, setLoading] = useState(false);

	async function onSave(e?: React.FormEvent) {
		e?.preventDefault();
		setLoading(true);

		const payload: KeyLimitPayload = {
			dailyRequests: dailyRequests ? parseInt(dailyRequests, 10) : null,
			weeklyRequests: weeklyRequests ? parseInt(weeklyRequests, 10) : null,
			monthlyRequests: monthlyRequests ? parseInt(monthlyRequests, 10) : null,
		};

		const promise = updateManagementKeyLimitsAction(k.id, payload);
		try {
			await toast.promise(promise, {
					loading: t("strings.phraseSavingLimits" as never),
					success: t("strings.Limits updated" as never),
				error: (err) => {
					const message =
							localizedSettingsError(err, t, "Failed to update limits");
					return message;
				},
			});
			setOpen(false);
		} finally {
			setLoading(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DropdownMenuItem render={<button
					className="w-full text-left flex items-center gap-2"
					onClick={(e) => {
						e.preventDefault();
						setTimeout(() => setOpen(true), 0);
					}} />}>

					<Settings className="mr-2" />
					{t("labels.limit")}

			</DropdownMenuItem>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShieldAlert className="h-5 w-5 text-amber-600" />
						{t("strings.Management API Key Limits" as never)}
					</DialogTitle>
					<DialogDescription>
						{t("strings.phraseSetRequestLimitsForThisElevatedPrivilegeKey" as never)}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSave} className="space-y-4">
					<div className="grid grid-cols-3 gap-4">
						<div className="space-y-2">
							<Label>{t("strings.Daily" as never)}</Label>
							<Input
								type="number"
								value={dailyRequests}
								onChange={(e) => setDailyRequests(e.target.value)}
								placeholder={t("teams.unlimited")}
							/>
						</div>
						<div className="space-y-2">
							<Label>{t("strings.Weekly" as never)}</Label>
							<Input
								type="number"
								value={weeklyRequests}
								onChange={(e) => setWeeklyRequests(e.target.value)}
								placeholder={t("teams.unlimited")}
							/>
						</div>
						<div className="space-y-2">
							<Label>{t("strings.Monthly" as never)}</Label>
							<Input
								type="number"
								value={monthlyRequests}
								onChange={(e) => setMonthlyRequests(e.target.value)}
								placeholder={t("teams.unlimited")}
							/>
						</div>
					</div>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="ghost">{t("labels.cancel")}</Button>
						</DialogClose>
						<Button type="submit" disabled={loading}>
							{loading ? t("labels.saving") : t("labels.save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
