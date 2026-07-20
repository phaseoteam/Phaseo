"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { accountBillingRequest } from "@/lib/billing/accountBillingClient";

type Props = {
	customerId: string;
	returnUrl?: string;
	className?: string;
	label?: string;
};

export function StripePortalButton({
	customerId,
	returnUrl,
	className,
	label = "Open Stripe Customer Portal",
}: Props) {
	const [loading, setLoading] = useState(false);

	return (
		<Button
			type="button"
			disabled={loading}
			className={cn("gap-2", className)}
			onClick={async () => {
				if (!customerId) return;
				setLoading(true);
				try {
					const data = await accountBillingRequest<{ url?: string }>("/api/account/settings/billing/portal", {
						method: "POST", body: JSON.stringify({
							customerId,
							returnUrl: returnUrl ?? window.location.href,
						}),
					});
					if (data?.url) {
						window.location.href = data.url;
					}
				} catch (err) {
					console.error("Failed to open billing portal", err);
				} finally {
					setLoading(false);
				}
			}}
		>
			{loading ? "Opening portal…" : label}
		</Button>
	);
}
