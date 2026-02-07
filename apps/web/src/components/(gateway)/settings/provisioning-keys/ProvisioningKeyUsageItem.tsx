"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { BarChart3 } from "lucide-react";
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

export default function ProvisioningKeyUsageItem({ k }: any) {
	const [open, setOpen] = useState(false);

	const usage = k.usage || { requests: 0, costNanos: 0 };

	return (
		<>
			<DropdownMenuItem asChild>
				<button
					className="w-full text-left flex items-center gap-2"
					onClick={(e) => {
						e.preventDefault();
						setTimeout(() => setOpen(true), 0);
					}}
				>
					<BarChart3 className="mr-2" />
					Usage
				</button>
			</DropdownMenuItem>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Usage for {k.name}</DialogTitle>
						<DialogDescription>
							Request usage and cost for this management API key.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="grid grid-cols-2 gap-4">
							<div className="p-4 bg-muted rounded-lg">
								<div className="text-sm text-muted-foreground">
									Total Requests
								</div>
								<div className="text-2xl font-bold">
									{usage.requests.toLocaleString()}
								</div>
							</div>
							<div className="p-4 bg-muted rounded-lg">
								<div className="text-sm text-muted-foreground">
									Total Cost
								</div>
								<div className="text-2xl font-bold">
									${(usage.costNanos / 1_000_000_000).toFixed(4)}
								</div>
							</div>
						</div>
					</div>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline">Close</Button>
						</DialogClose>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
