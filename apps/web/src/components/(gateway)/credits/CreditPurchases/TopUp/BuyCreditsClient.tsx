"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import CreditsPurchaseDialog from "@/components/(gateway)/credits/CreditPurchases/TopUp/CreditsPurchaseDialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, Ticket } from "lucide-react";

interface Props {
	wallet?: any;
	stripeInfo?: any;
	tierInfo?: any;
	embedded?: boolean;
	invoiceInviteStatus?: "none" | "pre_invoice" | "completed";
}

export default function BuyCreditsClient({
	wallet,
	stripeInfo,
	tierInfo,
	embedded = false,
	invoiceInviteStatus = "none",
}: Props) {
	const [open, setOpen] = useState(false);
	const isEnterpriseTier =
		String(tierInfo?.current?.key ?? "").toLowerCase() === "enterprise";
	const isPreInvoiceInvited = invoiceInviteStatus === "pre_invoice";

	if (embedded) {
		return (
			<div className="space-y-4">
				<h3 className="text-base font-semibold">Buy Credits</h3>

				<Button className="w-full" onClick={() => setOpen(true)}>
					Add Credits
				</Button>
				<div className="grid grid-cols-2 gap-2">
					<Button asChild variant="outline" className="w-full">
						<Link href="/gateway/usage" className="inline-flex items-center justify-center gap-2">
							View usage
							<ArrowUpRight className="h-4 w-4" />
						</Link>
					</Button>
					<Button asChild variant="outline" className="w-full">
						<Link href="/redeem" className="inline-flex items-center justify-center gap-2">
							Got a code?
							<Ticket className="h-4 w-4" />
						</Link>
					</Button>
				</div>
				<div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
					{isEnterpriseTier ? (
						isPreInvoiceInvited ? (
							<>
								You have been invited to setup invoiced billing.{" "}
								<Link
									href="/settings/credits/onboarding"
									className="font-medium text-foreground underline-offset-4 hover:underline"
								>
									Get started here
								</Link>
								.
							</>
						) : (
							<>
								Invoiced billing is currently invite-only.{" "}
								<Link
									href="/contact"
									className="font-medium text-foreground underline-offset-4 hover:underline"
								>
									Get in touch
								</Link>{" "}
								to request access.
							</>
						)
					) : (
						<>
							Invoiced billing is currently invite-only.
						</>
					)}
				</div>
				<CreditsPurchaseDialog
					open={open}
					onClose={() => setOpen(false)}
					wallet={wallet}
					stripeInfo={stripeInfo}
					tierInfo={tierInfo}
				/>
			</div>
		);
	}

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between pb-0">
				<CardTitle>Buy Credits</CardTitle>
				<Link href="/gateway/usage">
					<Badge variant={"outline"}>View Usage</Badge>
				</Link>
			</CardHeader>

			<Separator className="my-4" />

			<CardContent>
				<Button className="w-full" onClick={() => setOpen(true)}>
					Add Credits
				</Button>
				<Button asChild variant="outline" className="mt-3 w-full">
					<Link href="/redeem" className="inline-flex items-center justify-center gap-2">
						Got a code?
						<Ticket className="h-4 w-4" />
					</Link>
				</Button>
				<CreditsPurchaseDialog
					open={open}
					onClose={() => setOpen(false)}
					wallet={wallet}
					stripeInfo={stripeInfo}
					tierInfo={tierInfo}
				/>
			</CardContent>
		</Card>
	);
}
