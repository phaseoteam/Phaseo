"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { investigateGeneration } from "@/app/(dashboard)/gateway/usage/server-actions";
import RequestDetailDialog from "../RequestDetailDialog";
import type { RequestRow } from "@/app/(dashboard)/gateway/usage/server-actions";

interface InvestigateGenerationProps {
	iconOnly?: boolean;
}

export default function InvestigateGeneration({
	iconOnly = false,
}: InvestigateGenerationProps) {
	const [open, setOpen] = React.useState(false);
	const [id, setId] = React.useState("");
	const [loading, setLoading] = React.useState(false);
	const [request, setRequest] = React.useState<RequestRow | null>(null);
	const [detailOpen, setDetailOpen] = React.useState(false);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!id.trim()) {
			toast.error("Please enter a request ID");
			return;
		}

		try {
			setLoading(true);
			setRequest(null);

			const response = await investigateGeneration(id.trim());

			if (!response.success) {
				toast.error(response.error || "Failed to fetch request");
				return;
			}

			setRequest(response.data as RequestRow);
			setOpen(false);
			setDetailOpen(true);
		} catch (error) {
			console.error("Investigation error:", error);
			toast.error("Failed to load generation");
		} finally {
			setLoading(false);
		}
	}

	return (
		<>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogTrigger asChild>
					<Button
						variant="outline"
						size={iconOnly ? "icon" : "default"}
						aria-label="Investigate generation"
						title="Investigate generation"
					>
						<Search className={iconOnly ? "h-4 w-4" : "mr-2 h-4 w-4"} />
						{iconOnly ? null : "Investigate Generation"}
					</Button>
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Investigate Generation</DialogTitle>
					</DialogHeader>
					<form onSubmit={onSubmit} className="space-y-3">
						<div className="flex gap-2">
							<Input
								placeholder="Enter request_id"
								value={id}
								onChange={(e) => setId(e.target.value)}
							/>
							<Button type="submit" disabled={loading}>
								{loading ? "Loading..." : "Lookup"}
							</Button>
						</div>
					</form>
				</DialogContent>
			</Dialog>

			<RequestDetailDialog
				open={detailOpen}
				onOpenChange={setDetailOpen}
				request={request}
				appName={null}
			/>
		</>
	);
}
