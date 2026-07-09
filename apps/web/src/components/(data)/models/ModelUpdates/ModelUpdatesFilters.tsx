import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";

interface Provider {
	id: string;
	name: string;
}

interface EventTypeOption {
	type: string;
	label: string;
	icon: React.ReactNode;
	badgeClass: string;
}

interface ModelUpdatesFiltersProps {
	allProviders: Provider[];
	eventTypeOptions: EventTypeOption[];
	selectedProviders: string[];
	setSelectedProviders: (providers: string[]) => void;
	selectedEvents: string[];
	setSelectedEvents: (events: string[]) => void;
}

export default function ModelUpdatesFilters({
	allProviders,
	eventTypeOptions,
	selectedProviders,
	setSelectedProviders,
	selectedEvents,
	setSelectedEvents,
}: ModelUpdatesFiltersProps) {
	const isMobile = useIsMobile();
	const clearAll = () => {
		setSelectedProviders([]);
		setSelectedEvents([]);
	};
	const half = Math.ceil(allProviders.length / 2);
	const providerRows = [
		allProviders.slice(0, half),
		allProviders.slice(half),
	];

	return (
		<Card className="mb-6">
			<CardContent className="flex flex-col gap-4 pt-6">
				<div className="flex flex-wrap gap-4 items-center">
					<div className="flex-1" />
					{/* Clear filters */}
					<div className="ml-auto">
						<Button size="sm" variant="ghost" onClick={clearAll}>
							Clear
						</Button>
					</div>

					{/* Provider Filter */}
					<div className="w-full">
						<div className="font-semibold text-sm mb-2">
							Provider
						</div>
						{isMobile ? (
							<Sheet>
								<SheetTrigger asChild>
									<Button
										variant="outline"
										className="w-full flex items-center justify-between"
									>
										<span>Filter Providers</span>
										<span className="flex items-center gap-1 ml-2">
											{selectedProviders.length === 0
												? [
														"openai",
														"google",
														"anthropic",
														"spacex-ai",
												  ].map((id) => (
														<span
															key={id}
															className="w-6 h-6 rounded-full bg-white border flex items-center justify-center"
														>
															<Logo
																id={id}
																alt={id}
																width={20}
																height={20}
																className="object-contain rounded-full"
															/>
														</span>
												  ))
												: [
														...selectedProviders
															.slice(0, 4)
															.map((id) => (
																<span
																	key={id}
																	className="w-6 h-6 rounded-full bg-white border flex items-center justify-center"
																>
																	<Logo
																		id={id}
																		alt={id}
																		width={20}
																		height={20}
																		className="object-contain rounded-full"
																	/>
																</span>
															)),
														selectedProviders.length >
															4 && (
															<span
																key="more"
																className="ml-1 text-xs font-medium text-zinc-500"
															>
																+
																{selectedProviders.length -
																	4}
															</span>
														),
												  ]}
										</span>
									</Button>
								</SheetTrigger>
								<SheetContent
									side="bottom"
									className="max-h-[90vh] overflow-y-auto p-4 space-y-6"
								>
									<div className="font-semibold text-sm mb-2">
										Select Providers
									</div>
									<ToggleGroup
										type="multiple"
										value={selectedProviders}
										onValueChange={setSelectedProviders}
										className="grid grid-cols-2 gap-2 w-full"
									>
										{allProviders.map((provider) => (
											<ToggleGroupItem
												key={provider.id}
												value={provider.id}
												variant="outline"
												className="w-full rounded-full transition-all duration-200 data-[state=on]:bg-blue-100 data-[state=on]:text-blue-800 dark:data-[state=on]:bg-blue-900 dark:data-[state=on]:text-blue-100 hover:bg-blue-50 flex items-center gap-2 px-3 py-2 justify-center"
											>
												<Logo
													id={provider.id}
													alt={provider.name}
													width={18}
													height={18}
													className="rounded-sm"
												/>
												{provider.name}
											</ToggleGroupItem>
										))}
									</ToggleGroup>
								</SheetContent>
							</Sheet>
						) : (
							<ToggleGroup
								type="multiple"
								value={selectedProviders}
								onValueChange={setSelectedProviders}
								className="flex flex-col gap-2 w-full"
							>
								<div className="flex w-full gap-2">
									{providerRows[0].map((provider) => (
										<ToggleGroupItem
											key={provider.id}
											value={provider.id}
											variant="outline"
											className="flex-1 rounded-full transition-all duration-200 data-[state=on]:bg-blue-100 data-[state=on]:text-blue-800 dark:data-[state=on]:bg-blue-900 dark:data-[state=on]:text-blue-100 hover:bg-blue-50 flex items-center gap-2 px-3 py-1 justify-center"
										>
											<Logo
												id={provider.id}
												alt={provider.name}
												width={18}
												height={18}
												className="rounded-sm"
											/>
											{provider.name}
										</ToggleGroupItem>
									))}
								</div>
								<div className="flex w-full gap-2">
									{providerRows[1].map((provider) => (
										<ToggleGroupItem
											key={provider.id}
											value={provider.id}
											variant="outline"
											className="flex-1 rounded-full transition-all duration-200 data-[state=on]:bg-blue-100 data-[state=on]:text-blue-800 dark:data-[state=on]:bg-blue-900 dark:data-[state=on]:text-blue-100 hover:bg-blue-50 flex items-center gap-2 px-3 py-1 justify-center"
										>
											<Logo
												id={provider.id}
												alt={provider.name}
												width={18}
												height={18}
												className="rounded-sm"
											/>
											{provider.name}
										</ToggleGroupItem>
									))}
								</div>
							</ToggleGroup>
						)}
					</div>
					{/* Event Type Filter */}
					<div className="w-full">
						<div className="font-semibold text-sm mb-2">Event</div>
						{isMobile ? (
							<Sheet>
								<SheetTrigger asChild>
									<Button
										variant="outline"
										className="w-full flex items-center justify-between"
									>
										<span>Filter Events</span>
										<span className="flex items-center gap-1 ml-2">
											{selectedEvents.length === 0
												? eventTypeOptions
														.slice(0, 4)
														.map((event) => (
															<span
																key={event.type}
																className="w-6 h-6 rounded-full bg-white border flex items-center justify-center [&_svg]:mr-0"
															>
																<span className="text-current">
																	{event.icon}
																</span>
															</span>
														))
												: [
														...selectedEvents
															.slice(0, 4)
															.map((type) => {
																const event =
																	eventTypeOptions.find(
																		(e) =>
																			e.type ===
																			type
																	);
																return event ? (
																	<span
																		key={
																			type
																		}
																		className="w-6 h-6 rounded-full bg-white border flex items-center justify-center [&_svg]:mr-0"
																	>
																		{
																			event.icon
																		}
																	</span>
																) : null;
															}),
														selectedEvents.length >
															4 && (
															<span
																key="more"
																className="ml-1 text-xs font-medium text-zinc-500"
															>
																+
																{selectedEvents.length -
																	4}
															</span>
														),
												  ]}
										</span>
									</Button>
								</SheetTrigger>
								<SheetContent
									side="bottom"
									className="max-h-[90vh] overflow-y-auto p-4 space-y-6"
								>
									<div className="font-semibold text-sm mb-2">
										Select Events
									</div>
									<ToggleGroup
										type="multiple"
										value={selectedEvents}
										onValueChange={setSelectedEvents}
										className="grid grid-cols-2 gap-2 w-full"
									>
										{eventTypeOptions.map((event) => (
											<ToggleGroupItem
												key={event.type}
												value={event.type}
												variant="outline"
												className={`w-full rounded-full transition-all duration-200 flex items-center gap-2 px-3 py-2 justify-center ${event.badgeClass} data-[state=on]:bg-zinc-100 data-[state=on]:text-zinc-800 dark:data-[state=on]:bg-zinc-800 dark:data-[state=on]:text-zinc-100 hover:bg-zinc-50`}
											>
												{event.icon}
												{event.label}
											</ToggleGroupItem>
										))}
									</ToggleGroup>
								</SheetContent>
							</Sheet>
						) : (
							<ToggleGroup
								type="multiple"
								value={selectedEvents}
								onValueChange={setSelectedEvents}
								className="flex flex-col gap-2 w-full"
							>
								<div className="flex w-full gap-2">
									{eventTypeOptions.map((event) => {
										const isSelected =
											selectedEvents.includes(event.type);
										return (
											<ToggleGroupItem
												key={event.type}
												value={event.type}
												variant="outline"
												className={cn(
													"flex-1 rounded-full transition-all duration-200 flex items-center gap-2 px-3 py-1 justify-center border-2 text-current",
													isSelected
														? event.badgeClass +
																" border-none "
														: "bg-transparent border-current " +
																event.badgeClass +
																"text-current"
												)}
											>
												{event.icon}
												{event.label}
											</ToggleGroupItem>
										);
									})}
								</div>
							</ToggleGroup>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
