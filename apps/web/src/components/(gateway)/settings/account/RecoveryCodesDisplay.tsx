"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";

type RecoveryCodesDisplayProps = {
	codes: string[];
	onConfirm: () => void;
};

export function RecoveryCodesDisplay({
	codes,
	onConfirm,
}: RecoveryCodesDisplayProps) {
	const [confirmed, setConfirmed] = React.useState(false);

	const formattedCodes = React.useMemo(
		() => codes.filter(Boolean).join("\n"),
		[codes],
	);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(formattedCodes);
			toast.success("Recovery codes copied");
		} catch {
			toast.error("Failed to copy recovery codes");
		}
	};

	const handleDownload = () => {
		const blob = new Blob([formattedCodes], { type: "text/plain;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = "aistats-recovery-codes.txt";
		anchor.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="space-y-4">
			<div className="rounded-lg border bg-muted/30 p-4">
				<div className="grid gap-2 sm:grid-cols-2">
					{codes.map((code) => (
						<code
							key={code}
							className="rounded border bg-background px-3 py-2 text-sm font-mono"
						>
							{code}
						</code>
					))}
				</div>
			</div>

			<div className="flex flex-wrap gap-2">
				<Button type="button" variant="outline" onClick={handleCopy}>
					<Copy className="mr-2 h-4 w-4" />
					Copy codes
				</Button>
				<Button type="button" variant="outline" onClick={handleDownload}>
					<Download className="mr-2 h-4 w-4" />
					Download .txt
				</Button>
			</div>

			<div className="flex items-start gap-2">
				<Checkbox
					id="recovery-codes-confirmed"
					checked={confirmed}
					onCheckedChange={(value) => setConfirmed(value === true)}
				/>
				<Label
					htmlFor="recovery-codes-confirmed"
					className="cursor-pointer text-sm leading-6"
				>
					I have saved these recovery codes somewhere safe.
				</Label>
			</div>

			<div className="flex justify-end">
				<Button type="button" disabled={!confirmed} onClick={onConfirm}>
					Continue
				</Button>
			</div>
		</div>
	);
}
