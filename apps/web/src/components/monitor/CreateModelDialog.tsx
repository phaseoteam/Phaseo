"use client";

import { useState, useTransition, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Plus, Loader2 } from "lucide-react";
import { createModel } from "@/app/(dashboard)/internal/audit/actions";
import { fetchOrganisations } from "@/app/(dashboard)/internal/audit/actions-advanced";
import { useRouter } from "next/navigation";

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

export function CreateModelDialog() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	// Form state
	const [modelId, setModelId] = useState("");
	const [name, setName] = useState("");
	const [organisationId, setOrganisationId] = useState("");
	const [releaseDate, setReleaseDate] = useState("");
	const [retirementDate, setRetirementDate] = useState("");
	const [status, setStatus] = useState("active");
	const [hidden, setHidden] = useState(false);
	const [inputTypes, setInputTypes] = useState<string[]>(["text"]);
	const [outputTypes, setOutputTypes] = useState<string[]>(["text"]);

	const [organisations, setOrganisations] = useState<
		Array<{ id: string; name: string }>
	>([]);

	// Fetch organisations when dialog opens
	useEffect(() => {
		if (open) {
			fetchOrganisations().then((result) => {
				if (result.success) {
					setOrganisations(result.data);
				}
			});
		}
	}, [open]);

	// Reset form when dialog closes
	useEffect(() => {
		if (!open) {
			setModelId("");
			setName("");
			setOrganisationId("");
			setReleaseDate("");
			setRetirementDate("");
			setStatus("active");
			setHidden(false);
			setInputTypes(["text"]);
			setOutputTypes(["text"]);
			setError(null);
		}
	}, [open]);

	const handleCreate = () => {
		if (!modelId || !name) {
			setError("Model ID and Name are required");
			return;
		}

		setError(null);
		startTransition(async () => {
			const result = await createModel({
				modelId,
				name,
				organisationId: organisationId || null,
				releaseDate: releaseDate || null,
				retirementDate: retirementDate || null,
				status,
				hidden,
				inputTypes,
				outputTypes,
			});

			if (result.success) {
				setOpen(false);
				router.refresh();
			} else {
				setError(result.error || "Failed to create model");
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

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<Plus className="mr-2 h-4 w-4" />
					Create Model
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
				<DialogHeader>
					<DialogTitle className="text-lg sm:text-xl">Create New Model</DialogTitle>
					<DialogDescription className="text-sm">
						Add a new model to the database. All fields can be edited later.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					{error && (
						<div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-sm">
							{error}
						</div>
					)}

					{/* Model ID */}
					<div className="space-y-2">
						<Label htmlFor="model-id">
							Model ID * <span className="text-xs text-muted-foreground">(unique identifier)</span>
						</Label>
						<Input
							id="model-id"
							value={modelId}
							onChange={(e) => setModelId(e.target.value)}
							placeholder="e.g., openai/gpt-4-turbo"
						/>
						<p className="text-xs text-muted-foreground">
							Use format: organization/model-name or provider/model-name
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

					{/* Organization */}
					<div className="space-y-2">
						<Label htmlFor="organisation-select">Organization</Label>
						<Select
							value={organisationId || "none"}
							onValueChange={(value) =>
								setOrganisationId(value === "none" ? "" : value)
							}
						>
							<SelectTrigger id="organisation-select">
								<SelectValue placeholder="Select organization" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">None</SelectItem>
								{organisations.map((org) => (
									<SelectItem key={org.id} value={org.id}>
										{org.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Status */}
					<div className="space-y-2">
						<Label htmlFor="status">Status</Label>
						<Select value={status} onValueChange={setStatus}>
							<SelectTrigger id="status">
								<SelectValue placeholder="Select status" />
							</SelectTrigger>
							<SelectContent>
								{STATUS_OPTIONS.map((opt) => (
									<SelectItem key={opt} value={opt}>
										{opt.charAt(0).toUpperCase() + opt.slice(1)}
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
							onCheckedChange={(checked) => setHidden(checked === true)}
						/>
						<Label htmlFor="hidden" className="cursor-pointer font-normal text-sm">
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
						<Label htmlFor="retirement-date">Retirement Date</Label>
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
										inputTypes.includes(modality) ? "default" : "outline"
									}
									className="cursor-pointer text-xs sm:text-sm"
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
										outputTypes.includes(modality) ? "default" : "outline"
									}
									className="cursor-pointer text-xs sm:text-sm"
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

				<DialogFooter className="flex-col sm:flex-row gap-2">
					<Button
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isPending}
						className="w-full sm:w-auto"
					>
						Cancel
					</Button>
					<Button
						onClick={handleCreate}
						disabled={isPending || !modelId || !name}
						className="w-full sm:w-auto"
					>
						{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						Create Model
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
