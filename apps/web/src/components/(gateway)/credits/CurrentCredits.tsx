"use client";

import { useState } from "react";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { RefreshCredits } from "@/app/(dashboard)/settings/credits/actions";
import { toast } from "sonner";
import { CreditAmount } from "./CreditAmount";

interface Props {
	balance: number;
}

export default function CurrentCredits({ balance }: Props) {
	const [refreshing, setRefreshing] = useState(false);

	async function handleRefresh() {
		const MIN_SPIN_MS = 500; // minimum spin duration to ensure the animation is visible

		setRefreshing(true);
		const start = Date.now();
		try {
			// Call the API route which triggers server revalidation
			await toast.promise(RefreshCredits(), {
				loading: "Refreshing credits...",
				success: "Credits refreshed",
				error: () => "Failed to refresh credits",
			});
		} catch {
			// Errors are handled by toast.promise's error handler
		} finally {
			// Ensure the spinner is visible for at least MIN_SPIN_MS
			const elapsed = Date.now() - start;
			const remaining = MIN_SPIN_MS - elapsed;
			if (remaining > 0) {
				await new Promise((res) => setTimeout(res, remaining));
			}
			setRefreshing(false);
		}
	}

	return (
		<div>
			<Card>
				<CardHeader className="pb-0">
					<div className="flex items-center justify-between w-full">
						<CardTitle>Current Balance</CardTitle>
						<Button
							variant="ghost"
							size="icon"
							aria-label="refresh balance"
							onClick={handleRefresh}
							disabled={refreshing}
						>
							<RefreshCw
								className={`h-4 w-4 ${
									refreshing ? "animate-spin" : ""
								}`}
							/>
						</Button>
					</div>
				</CardHeader>

				<CardContent className="pt-4">
					<div>
						<CreditAmount
							value={balance}
							className={`text-3xl font-semibold font-mono ${
								balance < 0 ? "text-red-500" : ""
							}`}
						/>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
