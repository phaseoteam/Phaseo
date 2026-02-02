"use client";

import { useState, useTransition, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X, Loader2 } from "lucide-react";
import type { AuditModelData } from "@/lib/fetchers/models/table-view/getAuditModels";
import { updateModel } from "@/app/(dashboard)/internal/audit/actions";
import { useRouter } from "next/navigation";

interface EditModelDialogProps {
	model: AuditModelData | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const MODALITY_OPTIONS = [
	"text",
	"image",
	"video",
	"audio",
	"file",
	"embeddings",
	"code",
	"vision",
	"speech",
	"multimodal",
];

const STATUS_OPTIONS = ["active", "beta", "deprecated", "retired", "preview"];

export function EditModelDialog({
	model,
	open,
	onOpenChange,
}: EditModelDialogProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	// Form state
	const [name, setName] = useState(model?.modelName || "");
	const [releaseDate, setReleaseDate] = useState(
		model?.releaseDate?.split("T")[0] || ""
	);
	const [retirementDate, setRetirementDate] = useState(
		model?.retirementDate?.split("T")[0] || ""
	);
	const [status, setStatus] = useState(model?.status || "active");
	const [hidden, setHidden] = useState(model?.hidden || false);
	const [inputTypes, setInputTypes] = useState<string[]>(
		model?.inputTypes || []
	);
	const [outputTypes, setOutputTypes] = useState<string[]>(
		model?.outputTypes || []
	);

	// Update state when model changes
	useEffect(() => {
		if (model) {
			setName(model.modelName);
			setReleaseDate(model.releaseDate?.split("T")[0] || "");
			setRetirementDate(model.retirementDate?.split("T")[0] || "");
			setStatus(model.status || "active");
			setHidden(model.hidden);
			setInputTypes(model.inputTypes || []);
			setOutputTypes(model.outputTypes || []);
			setError(null);
		}
	}, [model]);

	const handleSave = () => {
		if (!model) return;

		setError(null);
		startTransition(async () => {
			const result = await updateModel({
				modelId: model.modelId,
				name,
				releaseDate: releaseDate || null,
				retirementDate: retirementDate || null,
				status: status || null,
				hidden,
				inputTypes,
				outputTypes,
			});

			if (result.success) {
				onOpenChange(false);
				router.refresh();
			} else {
				setError(result.error || "Failed to update model");
			}
		});
	};

	const toggleInputType = (type: string) => {
		setInputTypes((prev) =>
			prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
		);
	};

	const toggleOutputType = (type: string) => {
		setOutputTypes((prev) =>
			prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
		);
	};

	if (!model) return null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Edit Model</DialogTitle>
					<DialogDescription>
						Update model information. Changes will be saved directly
						to the database.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					{error && (
						<div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-sm">
							{error}
						</div>
					)}

					{/* Model ID (read-only) */}
					<div className="space-y-2">
						<Label htmlFor="model-id">Model ID</Label>
						<Input
							id="model-id"
							value={model.modelId}
							disabled
							className="bg-muted"
						/>
						<p className="text-xs text-muted-foreground">
							Model ID cannot be changed
						</p>
					</div>

					{/* Organization (read-only) */}
					<div className="space-y-2">
						<Label htmlFor="organisation">Organization</Label>
						<Input
							id="organisation"
							value={model.organisationName || "None"}
							disabled
							className="bg-muted"
						/>
						<p className="text-xs text-muted-foreground">
							Organization cannot be changed
						</p>
					</div>

					{/* Name */}
					<div className="space-y-2">
						<Label htmlFor="name">Display Name *</Label>
						<Input
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g., GPT-4 Turbo"
						/>
					</div>

					{/* Status */}
					<div className="space-y-2">
						<Label htmlFor="status">Status</Label>
						<Select value={status || "active"} onValueChange={setStatus}>
							<SelectTrigger id="status">
								<SelectValue placeholder="Select status" />
							</SelectTrigger>
							<SelectContent>
								{STATUS_OPTIONS.map((opt) => (
									<SelectItem key={opt} value={opt}>
										{opt.charAt(0).toUpperCase() +
											opt.slice(1)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Hidden */}
					<div className="flex items-center space-x-2">
						<Checkbox
							id="hidden"
							checked={hidden}
							onCheckedChange={(checked) =>
								setHidden(checked === true)
							}
						/>
						<Label
							htmlFor="hidden"
							className="cursor-pointer font-normal"
						>
							Hidden (model won't appear in public listings)
						</Label>
					</div>

					{/* Release Date */}
					<div className="space-y-2">
						<Label htmlFor="release-date">Release Date</Label>
						<Input
							id="release-date"
							type="date"
							value={releaseDate}
							onChange={(e) => setReleaseDate(e.target.value)}
						/>
					</div>

					{/* Retirement Date */}
					<div className="space-y-2">
						<Label htmlFor="retirement-date">
							Retirement Date
						</Label>
						<Input
							id="retirement-date"
							type="date"
							value={retirementDate}
							onChange={(e) => setRetirementDate(e.target.value)}
						/>
					</div>

					{/* Input Modalities */}
					<div className="space-y-2">
						<Label>Input Modalities</Label>
						<div className="flex flex-wrap gap-2">
							{MODALITY_OPTIONS.map((modality) => (
								<Badge
									key={modality}
									variant={
										inputTypes.includes(modality)
											? "default"
											: "outline"
									}
									className="cursor-pointer"
									onClick={() => toggleInputType(modality)}
								>
									{modality}
									{inputTypes.includes(modality) && (
										<X className="ml-1 h-3 w-3" />
									)}
								</Badge>
							))}
						</div>
						<p className="text-xs text-muted-foreground">
							Click to toggle input modalities
						</p>
					</div>

					{/* Output Modalities */}
					<div className="space-y-2">
						<Label>Output Modalities</Label>
						<div className="flex flex-wrap gap-2">
							{MODALITY_OPTIONS.map((modality) => (
								<Badge
									key={modality}
									variant={
										outputTypes.includes(modality)
											? "default"
											: "outline"
									}
									className="cursor-pointer"
									onClick={() => toggleOutputType(modality)}
								>
									{modality}
									{outputTypes.includes(modality) && (
										<X className="ml-1 h-3 w-3" />
									)}
								</Badge>
							))}
						</div>
						<p className="text-xs text-muted-foreground">
							Click to toggle output modalities
						</p>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={isPending || !name}>
						{isPending && (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						)}
						Save Changes
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
