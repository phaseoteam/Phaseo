"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
	const t = useTranslations("SettingsUI");

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
					toast.error(t("strings.Could not open the Stripe portal" as never), {
						description: t("strings.phrasePleaseTryAgain" as never),
					});
				} finally {
					setLoading(false);
				}
			}}
		>
			{loading ? t("strings.Opening portal…" as never) : label}
			<ArrowUpRight className="size-4" />
		</Button>
	);
}
