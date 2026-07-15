"use client";

import { useMemo } from "react";
import { useFormStatus } from "react-dom";
import { Beaker, Plus } from "lucide-react";
import { createPresetExperiment } from "@/app/(dashboard)/settings/presets/experiments/actions";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type PresetExperimentPresetOption = {
	id: string;
	name: string;
	slug: string | null;
	description: string | null;
};

function SubmitButton() {
	const status = useFormStatus();
	return (
		<Button type="submit" disabled={status.pending}>
			<Plus className="h-4 w-4" />
			{status.pending ? "Creating..." : "Create experiment"}
		</Button>
	);
}

export default function PresetExperimentCreateDialog({
	presets,
}: {
	presets: PresetExperimentPresetOption[];
}) {
	const sortedPresets = useMemo(
		() => [...presets].sort((a, b) => a.name.localeCompare(b.name)),
		[presets],
	);

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button size="sm" disabled={sortedPresets.length === 0}>
					<Beaker className="h-4 w-4" />
					New experiment
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Create preset experiment</DialogTitle>
					<DialogDescription>
						Group production feedback, test traffic, and cohort metadata around a candidate preset.
					</DialogDescription>
				</DialogHeader>
				<form action={createPresetExperiment} className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="preset-experiment-name">Name</Label>
							<Input
								id="preset-experiment-name"
								name="name"
								placeholder="Support answer quality"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="preset-experiment-dataset">Dataset</Label>
							<Input
								id="preset-experiment-dataset"
								name="dataset_name"
								placeholder="prod-chat, eval-v2"
							/>
						</div>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label>Candidate preset</Label>
							<Select name="preset_id" required>
								<SelectTrigger>
									<SelectValue placeholder="Select preset" />
								</SelectTrigger>
								<SelectContent>
									{sortedPresets.map((preset) => (
										<SelectItem key={preset.id} value={preset.id}>
											{preset.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label>Baseline preset</Label>
							<Select name="baseline_preset_id">
								<SelectTrigger>
									<SelectValue placeholder="Optional baseline" />
								</SelectTrigger>
								<SelectContent>
									{sortedPresets.map((preset) => (
										<SelectItem key={preset.id} value={preset.id}>
											{preset.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label>Status</Label>
							<Select name="status" defaultValue="pending">
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="pending">Pending</SelectItem>
									<SelectItem value="running">Running</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="preset-experiment-dimensions">Cohort keys</Label>
							<Input
								id="preset-experiment-dimensions"
								name="dimension_keys"
								placeholder="user_tier, region, plan"
							/>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="preset-experiment-description">Description</Label>
						<Textarea
							id="preset-experiment-description"
							name="description"
							rows={4}
							placeholder="What is being compared, which traffic should send feedback, and what success means."
						/>
					</div>
					<div className="flex justify-end">
						<SubmitButton />
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
