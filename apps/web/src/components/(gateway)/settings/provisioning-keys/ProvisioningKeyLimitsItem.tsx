"use client";

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
	updateProvisioningKeyLimitsAction,
	ProvisioningKeyLimitPayload,
} from "@/app/(dashboard)/settings/provisioning-keys/actions";
type KeyLimitPayload = ProvisioningKeyLimitPayload;
import { Label } from "@/components/ui/label";

export default function ProvisioningKeyLimitsItem({ k }: any) {
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

		const promise = updateProvisioningKeyLimitsAction(k.id, payload);
		try {
			await toast.promise(promise, {
				loading: "Saving limits...",
				success: "Limits updated",
				error: (err) => {
					const message =
						(err && (err as any).message) || "Failed to update limits";
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
			<DropdownMenuItem asChild>
				<button
					className="w-full text-left flex items-center gap-2"
					onClick={(e) => {
						e.preventDefault();
						setTimeout(() => setOpen(true), 0);
					}}
				>
					<Settings className="mr-2" />
					Limits
				</button>
			</DropdownMenuItem>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShieldAlert className="h-5 w-5 text-amber-600" />
						Management API Key Limits
					</DialogTitle>
					<DialogDescription>
						Set request limits for this elevated-privilege key.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSave} className="space-y-4">
					<div className="grid grid-cols-3 gap-4">
						<div className="space-y-2">
							<Label>Daily</Label>
							<Input
								type="number"
								value={dailyRequests}
								onChange={(e) => setDailyRequests(e.target.value)}
								placeholder="Unlimited"
							/>
						</div>
						<div className="space-y-2">
							<Label>Weekly</Label>
							<Input
								type="number"
								value={weeklyRequests}
								onChange={(e) => setWeeklyRequests(e.target.value)}
								placeholder="Unlimited"
							/>
						</div>
						<div className="space-y-2">
							<Label>Monthly</Label>
							<Input
								type="number"
								value={monthlyRequests}
								onChange={(e) => setMonthlyRequests(e.target.value)}
								placeholder="Unlimited"
							/>
						</div>
					</div>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="ghost">Cancel</Button>
						</DialogClose>
						<Button type="submit" disabled={loading}>
							{loading ? "Saving..." : "Save"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
