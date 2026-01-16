"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Logo } from "@/components/Logo";

type PricingModel = {
	provider: string;
	model: string;
	endpoint: string;
	display_name?: string;
	pricing_plan?: string | null;
	meters: Array<{
		meter: string;
		unit: string;
		unit_size: number;
		price_per_unit: string;
		currency: string;
	}>;
};

interface ModelSelectorProps {
	models: PricingModel[];
	selectedModelId: string;
	selectedEndpoint: string;
	availableEndpoints: string[];
	onModelSelect: (modelId: string) => void;
	onEndpointSelect: (endpoint: string) => void;
}

export function ModelSelector({
	models,
	selectedModelId,
	selectedEndpoint,
	availableEndpoints,
	onModelSelect,
	onEndpointSelect,
}: ModelSelectorProps) {
	const [openModel, setOpenModel] = useState(false);

	// Build model data with provider information
	const availableModels = useMemo(() => {
		const modelMap = new Map<
			string,
			{ modelId: string; displayName: string; providers: Set<string> }
		>();

		models.forEach((m) => {
			if (!modelMap.has(m.model)) {
				modelMap.set(m.model, {
					modelId: m.model,
					displayName: m.display_name || m.model,
					providers: new Set(),
				});
			}
			modelMap.get(m.model)!.providers.add(m.provider);
		});

		return Array.from(modelMap.values())
			.map((m) => ({
				...m,
				providers: Array.from(m.providers).sort(),
			}))
			.sort((a, b) => a.displayName.localeCompare(b.displayName));
	}, [models]);

	const selectedModelDisplay = availableModels.find(
		(m) => m.modelId === selectedModelId
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Model Selection</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="model-select">Select Model</Label>
					<Popover open={openModel} onOpenChange={setOpenModel}>
						<PopoverTrigger asChild>
							<Button
								variant="outline"
								role="combobox"
								aria-expanded={openModel}
								className="w-full justify-between"
							>
								{selectedModelDisplay
									? selectedModelDisplay.displayName
									: "Select model..."}
								<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-[600px] p-0">
							<Command>
								<CommandInput placeholder="Search models..." />
								<CommandList>
									<CommandEmpty>No model found.</CommandEmpty>
									<CommandGroup>
										{availableModels.map((model) => (
											<CommandItem
												key={model.modelId}
												value={model.displayName}
												onSelect={() => {
													onModelSelect(model.modelId);
													setOpenModel(false);
												}}
												className="flex items-center justify-between"
											>
												<div className="flex items-center">
													<Check
														className={cn(
															"mr-2 h-4 w-4",
															selectedModelId === model.modelId
																? "opacity-100"
																: "opacity-0"
														)}
													/>
													{model.displayName}
												</div>
												<div className="flex items-center gap-1 ml-4">
													{model.providers.map((provider) => (
														<Logo
															key={provider}
															id={provider}
															width={16}
															height={16}
															className="w-4 h-4"
															fallback={<div className="w-4 h-4 bg-muted rounded" />}
														/>
													))}
												</div>
											</CommandItem>
										))}
									</CommandGroup>
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>
				</div>

				{selectedModelId && availableEndpoints.length > 0 && (
					<div className="space-y-2">
						<Label htmlFor="endpoint-select">Select Endpoint</Label>
						<Select
							value={selectedEndpoint}
							onValueChange={onEndpointSelect}
						>
							<SelectTrigger id="endpoint-select">
								<SelectValue placeholder="Select endpoint..." />
							</SelectTrigger>
							<SelectContent>
								{availableEndpoints.map((endpoint) => (
									<SelectItem key={endpoint} value={endpoint}>
										{endpoint}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
