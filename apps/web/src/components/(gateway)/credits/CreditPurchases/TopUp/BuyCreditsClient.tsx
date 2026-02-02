"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import CreditsPurchaseDialog from "@/components/(gateway)/credits/CreditPurchases/TopUp/CreditsPurchaseDialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface Props {
	wallet?: any;
	stripeInfo?: any;
	tierInfo?: any;
}

export default function BuyCreditsClient({
	wallet,
	stripeInfo,
	tierInfo,
}: Props) {
	const [open, setOpen] = useState(false);

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
