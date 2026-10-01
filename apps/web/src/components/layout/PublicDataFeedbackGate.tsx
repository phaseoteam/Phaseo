"use client";

import { usePathname } from "next/navigation";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import {
	PUBLIC_DATA_ROUTE_ROOTS,
	isPublicDataPathname,
} from "@/lib/publicDataRoutes";

export default function PublicDataFeedbackGate() {
	const pathname = usePathname();

	if (!isPublicDataPathname(pathname)) return null;

	const pageRoot = PUBLIC_DATA_ROUTE_ROOTS.find(
		(root) => pathname === root || pathname?.startsWith(`${root}/`),
	);

	return (
		<section
			aria-labelledby="public-data-feedback-heading"
			className="border-y border-border/60 bg-muted/20"
		>
			<div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
				<div className="max-w-2xl space-y-1">
					<h2
						id="public-data-feedback-heading"
						className="text-sm font-semibold text-foreground"
					>
						Help keep public data accurate
					</h2>
					<p className="text-sm text-muted-foreground">
						See something missing, incorrect, or out of date? Tell us about this page.
					</p>
				</div>
				<ProductFeedbackButton
					label="Report a data issue"
					title="Report a data issue"
					submitLabel="Send report"
					successMessage="Report sent — thank you."
					defaultCategory="issue"
					defaultReason="incorrect_data"
					surface="public_data_report"
					prompt="Tell us what looks incorrect, missing, or out of date on this public data page."
					context={{ page_root: pageRoot ?? null }}
				/>
			</div>
		</section>
	);
}
