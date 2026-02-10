"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/ui/copy-button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { BASE_URL } from "@/components/(data)/model/quickstart/config";
import { Switch } from "@/components/ui/switch";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

interface Message {
	role: "user" | "assistant" | "system";
	content: string;
}

interface RequestBuilderProps {
	models?: GatewaySupportedModel[];
}

export default function RequestBuilder({ models }: RequestBuilderProps) {
	const initialModelId = models?.[0]?.modelId ?? "";

	const [model, setModel] = useState<string>(initialModelId);
	const [messages, setMessages] = useState<Message[]>([
		{
			role: "system",
			content: `You are ${initialModelId || "this model"}`,
		},
		{ role: "user", content: "Hey!" },
	]);
	const [systemPromptTouched, setSystemPromptTouched] = useState(false);
	const [temperature, setTemperature] = useState<number>(0.7);
	const [maxOutputTokens, setMaxOutputTokens] = useState<number>(1000);
	const [modelPickerOpen, setModelPickerOpen] = useState(false);
	const [stream, setStream] = useState(false);
	const [presencePenalty, setPresencePenalty] = useState<
		number | undefined
	>();
	const [frequencyPenalty, setFrequencyPenalty] = useState<
		number | undefined
	>();
	const [topP, setTopP] = useState<number | undefined>();
	const [seed, setSeed] = useState<number | undefined>();
	const [logprobs, setLogprobs] = useState(false);
	const [topLogprobs, setTopLogprobs] = useState<number | undefined>();
	const [meta, setMeta] = useState(false);
	const [usage, setUsage] = useState(true);
	const [reasoningEffort, setReasoningEffort] = useState<
		"" | "minimal" | "low" | "medium" | "high"
	>("");
	const [reasoningSummary, setReasoningSummary] = useState<
		"" | "auto" | "concise" | "detailed"
	>("");
	// const [toolJsonItems, setToolJsonItems] = useState<string[]>([]);
	// const [toolChoiceMode, setToolChoiceMode] = useState<"" | "auto" | "none">(
	//     ""
	// );
	// const [toolChoiceObjectJson, setToolChoiceObjectJson] = useState("");
	const [logitBiasEntries, setLogitBiasEntries] = useState<
		Array<{ token: string; bias: string }>
	>([]);

	const buildRequestBody = () => {
		const body: Record<string, unknown> = {
			model,
			messages,
			temperature,
			max_output_tokens: maxOutputTokens,
		};

		if (stream) body.stream = true;
		if (presencePenalty != null) body.presence_penalty = presencePenalty;
		if (frequencyPenalty != null) body.frequency_penalty = frequencyPenalty;
		if (topP != null) body.top_p = topP;
		if (seed != null) body.seed = seed;
		if (logprobs) body.logprobs = true;
		if (topLogprobs != null) body.top_logprobs = topLogprobs;
		if (meta) body.meta = true;
		if (!usage) body.usage = false;

		if (reasoningEffort || reasoningSummary) {
			const entry: Record<string, string> = {};
			if (reasoningEffort) entry.effort = reasoningEffort;
			if (reasoningSummary) entry.summary = reasoningSummary;
			body.reasoning = [entry];
		}

		// Tools and tool_choice will be implemented later.
		// if (toolJsonItems.length) {
		//     const parsed: unknown[] = [];
		//     for (const raw of toolJsonItems) {
		//         if (!raw.trim()) continue;
		//         try {
		//             parsed.push(JSON.parse(raw));
		//         } catch {
		//             // ignore invalid JSON entries
		//         }
		//     }
		//     if (parsed.length) {
		//         body.tools = parsed;
		//     }
		// }
		//
		// if (toolChoiceObjectJson.trim()) {
		//     try {
		//         body.tool_choice = JSON.parse(toolChoiceObjectJson);
		//     } catch {
		//         // ignore invalid JSON
		//     }
		// } else if (toolChoiceMode) {
		//     body.tool_choice = toolChoiceMode;
		// }

		if (logitBiasEntries.length) {
			const bias: Record<string, number> = {};
			for (const entry of logitBiasEntries) {
				const token = entry.token.trim();
				if (!token) continue;
				const value = Number.parseFloat(entry.bias);
				if (!Number.isFinite(value)) continue;
				bias[token] = value;
			}
			if (Object.keys(bias).length) {
				body.logit_bias = bias;
			}
		}

		return body;
	};

	const escapeForSingleQuotedShell = (json: string) =>
		json.replace(/'/g, "\\'");

	const jsonToPythonLiteral = (json: string) =>
		json
			.replace(/true/g, "True")
			.replace(/false/g, "False")
			.replace(/null/g, "None");

	const addMessage = () => {
		setMessages((prev) => [...prev, { role: "user", content: "" }]);
	};

	const updateMessage = (
		index: number,
		field: keyof Message,
		value: string,
		roleOverride?: Message["role"]
	) => {
		setMessages((prev) => {
			const next = [...prev];
			const prevMsg = next[index];
			next[index] = { ...prevMsg, [field]: value };

			const effectiveRole = roleOverride ?? prevMsg?.role;
			if (field === "content" && effectiveRole === "system") {
				setSystemPromptTouched(true);
			}

			return next;
		});
	};

	const removeMessage = (index: number) => {
		setMessages((prev) => prev.filter((_, i) => i !== index));
	};

	const generateCurl = () => {
		const json = JSON.stringify(buildRequestBody(), null, 2);
		const escapedJson = escapeForSingleQuotedShell(json);
		return `curl -X POST "${BASE_URL}/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_GATEWAY_KEY" \\
  -d '${escapedJson}'`;
	};

	const generateTypeScript = () => {
		const json = JSON.stringify(buildRequestBody(), null, 2)
			.split("\n")
			.map((line) => `        ${line}`)
			.join("\n");

		return `const response = await fetch("${BASE_URL}/chat/completions", {
    method: "POST",
    headers: {
        "Authorization": "Bearer YOUR_GATEWAY_KEY",
        "Content-Type": "application/json",
    },
    body: JSON.stringify(
${json}
    ),
});

if (!response.ok) {
    throw new Error(await response.text());
}

const data = await response.json();
console.log(data.choices?.[0]?.message?.content);`;
	};

	const generatePython = () => {
		const json = JSON.stringify(buildRequestBody(), null, 2);
		const pythonJson = jsonToPythonLiteral(json)
			.split("\n")
			.map((line) => `    ${line}`)
			.join("\n");

		return `import requests

url = "${BASE_URL}/chat/completions"
headers = {
    "Authorization": "Bearer YOUR_GATEWAY_KEY",
    "Content-Type": "application/json",
}
data = ${pythonJson}

response = requests.post(url, headers=headers, json=data)
response.raise_for_status()
print(response.json()["choices"][0]["message"]["content"])`;
	};

    const groupedModels = useMemo(() => {
        const groups = new Map<string, GatewaySupportedModel[]>();
        for (const entry of models ?? []) {
            const current = groups.get(entry.providerId) ?? [];
            current.push(entry);
            groups.set(entry.providerId, current);
        }
        return Array.from(groups.entries()).map(([providerId, entries]) => ({
            providerId,
            providerName: entries[0]?.providerName ?? providerId,
            entries,
        }));
    }, [models]);

	const selectedModel = useMemo(
		() => (models ?? []).find((m) => m.modelId === model),
		[models, model]
	);

	return (
		<div className="container mx-auto py-8 px-4">
			<div className="mb-8">
				<h1 className="text-3xl font-bold mb-2">Request Builder</h1>
				<p className="text-muted-foreground">
					Build API requests interactively and generate code snippets
					in multiple languages.
				</p>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				<Card>
					<CardHeader>
						<CardTitle>Parameters</CardTitle>
					</CardHeader>
					<CardContent className="space-y-6">
						<div>
							<Label htmlFor="model">Model</Label>
							<Popover
								open={modelPickerOpen}
								onOpenChange={setModelPickerOpen}
							>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										role="combobox"
										aria-expanded={modelPickerOpen}
										className="w-full justify-between"
									>
										{selectedModel ? (
											<span className="truncate text-left">
                                        {selectedModel.providerName ??
                                            selectedModel.providerId}{" "}
                                        {selectedModel.modelId}
											</span>
										) : models?.length ? (
											"Select model..."
										) : (
											"No active gateway models found"
										)}
										<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-[360px] p-0">
									<Command>
										<CommandInput
											placeholder="Search models..."
											className="h-9"
										/>
										<CommandList>
											<CommandEmpty>
												No models found.
											</CommandEmpty>
                                {groupedModels.map((group) => (
                                    <CommandGroup
                                        key={group.providerId}
                                        heading={group.providerName}
                                    >
													{group.entries.map(
														(entry) => (
															<CommandItem
																key={`${group.providerId}:${entry.modelId}`}
																value={
																	entry.modelId
																}
																onSelect={(
																	currentValue
																) => {
																	setModel(
																		currentValue
																	);
																	setMessages(
																		(
																			prev
																		) => {
																			if (
																				!prev.length
																			) {
																				return [
																					{
																						role: "system",
																						content: `You are ${currentValue}`,
																					},
																					{
																						role: "user",
																						content:
																							"Hey!",
																					},
																				];
																			}

																			const next =
																				[
																					...prev,
																				];
																			const systemIndex =
																				next.findIndex(
																					(
																						m
																					) =>
																						m.role ===
																						"system"
																				);
																			const newContent = `You are ${currentValue}`;

																			if (
																				systemIndex ===
																				-1
																			) {
																				next.unshift(
																					{
																						role: "system",
																						content:
																							newContent,
																					}
																				);
																			} else {
																				next[
																					systemIndex
																				] =
																					{
																						...next[
																							systemIndex
																						],
																						content:
																							newContent,
																					};
																			}

																			return next;
																		}
																	);
																	setModelPickerOpen(
																		false
																	);
																}}
															>
																<span className="truncate">
																	{
																		entry.modelId
																	}
																</span>
																<Check
																	className={cn(
																		"ml-auto h-4 w-4",
																		model ===
																			entry.modelId
																			? "opacity-100"
																			: "opacity-0"
																	)}
																/>
															</CommandItem>
														)
													)}
												</CommandGroup>
											))}
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>
						</div>

						<div>
							<div className="flex items-center justify-between mb-2">
								<Label>Messages</Label>
								<Button
									onClick={addMessage}
									size="sm"
									variant="outline"
								>
									Add Message
								</Button>
							</div>
							<div className="space-y-4">
								{messages.map((message, index) => (
									<div
										key={index}
										className="border rounded-lg p-4 space-y-2"
									>
										<div className="flex items-center justify-between">
											<Select
												value={message.role}
												onValueChange={(
													value: Message["role"]
												) =>
													updateMessage(
														index,
														"role",
														value
													)
												}
											>
												<SelectTrigger className="w-32">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="system">
														System
													</SelectItem>
													<SelectItem value="user">
														User
													</SelectItem>
													<SelectItem value="assistant">
														Assistant
													</SelectItem>
												</SelectContent>
											</Select>
											{messages.length > 1 && (
												<Button
													onClick={() =>
														removeMessage(index)
													}
													size="sm"
													variant="destructive"
												>
													Remove
												</Button>
											)}
										</div>
										<Textarea
											value={message.content}
											onChange={(e) =>
												updateMessage(
													index,
													"content",
													e.target.value,
													message.role
												)
											}
											placeholder="Enter message content..."
											rows={3}
										/>
									</div>
								))}
							</div>
						</div>

						<div className="space-y-4">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<Label htmlFor="temperature">
										Temperature
									</Label>
									<Input
										id="temperature"
										type="number"
										min="0"
										max="2"
										step="0.1"
										value={temperature}
										onChange={(e) =>
											setTemperature(
												parseFloat(e.target.value)
											)
										}
									/>
								</div>
								<div>
									<Label htmlFor="maxOutputTokens">
										Max Output Tokens
									</Label>
									<Input
										id="maxOutputTokens"
										type="number"
										min="1"
										value={maxOutputTokens}
										onChange={(e) =>
											setMaxOutputTokens(
												Number.parseInt(
													e.target.value,
													10
												)
											)
										}
									/>
								</div>
							</div>

							<Accordion
								type="single"
								collapsible
								className="border rounded-lg"
							>
								<AccordionItem value="advanced">
									<AccordionTrigger className="px-4">
										Advanced parameters
									</AccordionTrigger>
									<AccordionContent className="px-4 space-y-4">
										<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
											<div>
												<Label
													htmlFor="presencePenalty"
													className="mb-1 block"
												>
													Presence Penalty
												</Label>
												<Input
													id="presencePenalty"
													type="number"
													min="-2"
													max="2"
													step="0.1"
													value={
														presencePenalty ?? ""
													}
													onChange={(e) =>
														setPresencePenalty(
															e.target.value ===
																""
																? undefined
																: parseFloat(
																		e.target
																			.value
																  )
														)
													}
												/>
											</div>
											<div>
												<Label
													htmlFor="frequencyPenalty"
													className="mb-1 block"
												>
													Frequency Penalty
												</Label>
												<Input
													id="frequencyPenalty"
													type="number"
													min="-2"
													max="2"
													step="0.1"
													value={
														frequencyPenalty ?? ""
													}
													onChange={(e) =>
														setFrequencyPenalty(
															e.target.value ===
																""
																? undefined
																: parseFloat(
																		e.target
																			.value
																  )
														)
													}
												/>
											</div>
										</div>

										<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
											<div>
												<Label
													htmlFor="topP"
													className="mb-1 block"
												>
													Top P
												</Label>
												<Input
													id="topP"
													type="number"
													min="0"
													max="1"
													step="0.01"
													value={topP ?? ""}
													onChange={(e) =>
														setTopP(
															e.target.value ===
																""
																? undefined
																: parseFloat(
																		e.target
																			.value
																  )
														)
													}
												/>
											</div>
										</div>

										<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
											<div>
												<Label
													htmlFor="seed"
													className="mb-1 block"
												>
													Seed
												</Label>
												<Input
													id="seed"
													type="number"
													value={seed ?? ""}
													onChange={(e) =>
														setSeed(
															e.target.value ===
																""
																? undefined
																: Number.parseInt(
																		e.target
																			.value,
																		10
																  )
														)
													}
												/>
											</div>
											<div>
												<Label
													htmlFor="topLogprobs"
													className="mb-1 block"
												>
													Top Logprobs
												</Label>
												<Input
													id="topLogprobs"
													type="number"
													min="0"
													max="20"
													value={topLogprobs ?? ""}
													onChange={(e) =>
														setTopLogprobs(
															e.target.value ===
																""
																? undefined
																: Number.parseInt(
																		e.target
																			.value,
																		10
																  )
														)
													}
												/>
											</div>
										</div>

										<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
											<div className="flex items-center justify-between space-x-2">
												<Label
													htmlFor="stream"
													className="mb-1 block"
												>
													Stream
												</Label>
												<Switch
													id="stream"
													checked={stream}
													onCheckedChange={setStream}
												/>
											</div>
											<div className="flex items-center justify-between space-x-2">
												<Label
													htmlFor="logprobs"
													className="mb-1 block"
												>
													Logprobs
												</Label>
												<Switch
													id="logprobs"
													checked={logprobs}
													onCheckedChange={
														setLogprobs
													}
												/>
											</div>
											<div className="flex items-center justify-between space-x-2">
												<Label
													htmlFor="meta"
													className="mb-1 block"
												>
													Include Meta
												</Label>
												<Switch
													id="meta"
													checked={meta}
													onCheckedChange={setMeta}
												/>
											</div>
											<div className="flex items-center justify-between space-x-2">
												<Label
													htmlFor="usage"
													className="mb-1 block"
												>
													Include Usage
												</Label>
												<Switch
													id="usage"
													checked={usage}
													onCheckedChange={setUsage}
												/>
											</div>
										</div>

										<div className="space-y-2">
											<Label
												htmlFor="reasoningEffort"
												className="mb-1 block"
											>
												Reasoning
											</Label>
											<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
												<div>
													<Label
														htmlFor="reasoningEffort"
														className="mb-1 block"
													>
														Effort
													</Label>
													<Select
														value={reasoningEffort}
														onValueChange={(
															value
														) =>
															setReasoningEffort(
																value as
																	| "minimal"
																	| "low"
																	| "medium"
																	| "high"
															)
														}
													>
														<SelectTrigger id="reasoningEffort">
															<SelectValue placeholder="None" />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="minimal">
																minimal
															</SelectItem>
															<SelectItem value="low">
																low
															</SelectItem>
															<SelectItem value="medium">
																medium
															</SelectItem>
															<SelectItem value="high">
																high
															</SelectItem>
														</SelectContent>
													</Select>
												</div>
												<div>
													<Label
														htmlFor="reasoningSummary"
														className="mb-1 block"
													>
														Summary
													</Label>
													<Select
														value={reasoningSummary}
														onValueChange={(
															value
														) =>
															setReasoningSummary(
																value as
																	| "auto"
																	| "concise"
																	| "detailed"
															)
														}
													>
														<SelectTrigger id="reasoningSummary">
															<SelectValue placeholder="None" />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="auto">
																auto
															</SelectItem>
															<SelectItem value="concise">
																concise
															</SelectItem>
															<SelectItem value="detailed">
																detailed
															</SelectItem>
														</SelectContent>
													</Select>
												</div>
											</div>
										</div>
										<div className="space-y-2">
											<div className="flex items-center justify-between">
												<Label
													htmlFor="logitBias"
													className="mb-1 block"
												>
													Logit Bias Entries
												</Label>
												<Button
													type="button"
													size="sm"
													variant="outline"
													onClick={() =>
														setLogitBiasEntries(
															(prev) => [
																...prev,
																{
																	token: "",
																	bias: "",
																},
															]
														)
													}
												>
													Add entry
												</Button>
											</div>
											{logitBiasEntries.length === 0 ? (
												<p className="text-xs text-muted-foreground">
													Add per-token bias entries.
													Each token key maps to a
													bias value.
												</p>
											) : (
												<div className="space-y-3">
													{logitBiasEntries.map(
														(entry, index) => (
															<div
																key={index}
																className="grid grid-cols-1 md:grid-cols-[2fr,2fr,auto] gap-2 items-end"
															>
																<div>
																	<Label className="mb-1 block">
																		Token
																	</Label>
																	<Input
																		value={
																			entry.token
																		}
																		onChange={(
																			e
																		) =>
																			setLogitBiasEntries(
																				(
																					prev
																				) => {
																					const next =
																						[
																							...prev,
																						];
																					next[
																						index
																					] =
																						{
																							...next[
																								index
																							],
																							token: e
																								.target
																								.value,
																						};
																					return next;
																				}
																			)
																		}
																	/>
																</div>
																<div>
																	<Label className="mb-1 block">
																		Bias
																	</Label>
																	<Input
																		type="number"
																		value={
																			entry.bias
																		}
																		onChange={(
																			e
																		) =>
																			setLogitBiasEntries(
																				(
																					prev
																				) => {
																					const next =
																						[
																							...prev,
																						];
																					next[
																						index
																					] =
																						{
																							...next[
																								index
																							],
																							bias: e
																								.target
																								.value,
																						};
																					return next;
																				}
																			)
																		}
																	/>
																</div>
																<Button
																	type="button"
																	size="sm"
																	variant="ghost"
																	onClick={() =>
																		setLogitBiasEntries(
																			(
																				prev
																			) =>
																				prev.filter(
																					(
																						_,
																						i
																					) =>
																						i !==
																						index
																				)
																		)
																	}
																>
																	Remove
																</Button>
															</div>
														)
													)}
												</div>
											)}
										</div>
									</AccordionContent>
								</AccordionItem>
							</Accordion>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Generated Code</CardTitle>
					</CardHeader>
					<CardContent>
						<Tabs defaultValue="curl" className="w-full">
							<TabsList className="grid w-full grid-cols-3">
								<TabsTrigger value="curl">cURL</TabsTrigger>
								<TabsTrigger value="typescript">
									TypeScript
								</TabsTrigger>
								<TabsTrigger value="python">Python</TabsTrigger>
							</TabsList>
							<TabsContent value="curl" className="mt-4">
								<div className="relative">
									<pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
										<code>{generateCurl()}</code>
									</pre>
									<div className="absolute top-2 right-2">
										<CopyButton content={generateCurl()} />
									</div>
								</div>
							</TabsContent>
							<TabsContent value="typescript" className="mt-4">
								<div className="relative">
									<pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
										<code>{generateTypeScript()}</code>
									</pre>
									<div className="absolute top-2 right-2">
										<CopyButton
											content={generateTypeScript()}
										/>
									</div>
								</div>
							</TabsContent>
							<TabsContent value="python" className="mt-4">
								<div className="relative">
									<pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
										<code>{generatePython()}</code>
									</pre>
									<div className="absolute top-2 right-2">
										<CopyButton
											content={generatePython()}
										/>
									</div>
								</div>
							</TabsContent>
						</Tabs>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
