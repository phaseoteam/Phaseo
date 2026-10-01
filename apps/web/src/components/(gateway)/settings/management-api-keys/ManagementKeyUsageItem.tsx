"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { BarChart3 } from "lucide-react";
import { DisplayNumber } from "@/components/display/DisplayValue";
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
import { useState } from "react";
import { useTranslations } from "next-intl";

export default function ManagementKeyUsageItem({ k }: any) {
	const [open, setOpen] = useState(false);
	const t = useTranslations("SettingsUI");

	const usage = k.usage || { requests: 0, costNanos: 0 };

	return (
		<>
			<DropdownMenuItem render={<button
					className="w-full text-left flex items-center gap-2"
					onClick={(e) => {
						e.preventDefault();
						setTimeout(() => setOpen(true), 0);
					}} />}>

					<BarChart3 className="mr-2" />
					{t("strings.Usage" as never)}

			</DropdownMenuItem>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("strings.Usage for" as never)} {k.name}</DialogTitle>
						<DialogDescription>
							{t("strings.Request usage and cost for this management API key." as never)}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="grid grid-cols-2 gap-4">
							<div className="p-4 bg-muted rounded-lg">
								<div className="text-sm text-muted-foreground">
									{t("strings.Total Requests" as never)}
								</div>
								<div className="text-2xl font-bold">
									<DisplayNumber value={usage.requests} />
								</div>
							</div>
							<div className="p-4 bg-muted rounded-lg">
								<div className="text-sm text-muted-foreground">
									{t("strings.Total Cost" as never)}
								</div>
								<div className="text-2xl font-bold">
									${(usage.costNanos / 1_000_000_000).toFixed(4)}
								</div>
							</div>
						</div>
					</div>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline">{t("labels.close")}</Button>
						</DialogClose>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
