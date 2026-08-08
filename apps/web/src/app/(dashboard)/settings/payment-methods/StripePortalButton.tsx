"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowUpRight } from "lucide-react";

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
	label = "Customer Portal",
}: Props) {
	const [loading, setLoading] = useState(false);

	return (
		<Button
			type="button"
			variant="outline"
			disabled={loading}
			className={cn("gap-2", className)}
			onClick={async () => {
				if (!customerId) return;
				setLoading(true);
				try {
					const resp = await fetch("/api/stripe/billing-portal", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							customerId,
							returnUrl: returnUrl ?? window.location.href,
						}),
					});
					const data = await resp.json();
					if (data?.url) {
						window.location.href = data.url;
					}
				} catch {
					toast.error("Could not open the Stripe portal", {
						description: "Please try again.",
					});
				} finally {
					setLoading(false);
				}
			}}
		>
			{loading ? "Opening portal…" : label}
			<ArrowUpRight className="size-4" />
		</Button>
	);
}
