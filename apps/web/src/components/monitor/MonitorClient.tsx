"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	MonitorDataTable,
	type ModelData,
} from "@/components/monitor/MonitorDataTable";
import {
	MonitorHistoryClient,
	type ChangeHistory,
} from "@/components/monitor/MonitorHistoryClient";
import { type MonitorModelData } from "@/lib/fetchers/models/table-view/getMonitorModels";

interface MonitorClientProps {
	initialModelData: MonitorModelData[];
}

export function MonitorClient({ initialModelData }: MonitorClientProps) {
	const [activeTab, setActiveTab] = useState("table");
	const [changeHistory, setChangeHistory] = useState<ChangeHistory[]>([]);

	// Convert MonitorModelData to ModelData format for the table
	const modelData: ModelData[] = initialModelData.map((item) => ({
		id: item.id,
		model: item.model,
		modelId: item.modelId,
		organisationId: item.organisationId,
		provider: item.provider,
		endpoint: item.endpoint,
		gatewayStatus: item.gatewayStatus,
		inputModalities: item.inputModalities,
		outputModalities: item.outputModalities,
		context: item.context,
		maxOutput: item.maxOutput,
		quantization: item.quantization,
		added: item.added,
		retired: item.retired,
	}));

	// Simulate real-time changes
	useEffect(() => {
		const interval = setInterval(() => {
			const now = new Date();
			const providers = ["OpenAI", "Anthropic", "Google", "Meta"];
			const models = [
				"gpt-4-turbo",
				"claude-3-opus",
				"gemini-pro",
				"llama-3-70b",
			];

			const changes = [
				{
					field: "inputPrice",
					oldValue: 0.01,
					newValue: 0.0105,
					percentChange: 5,
				},
				{
					field: "outputPrice",
					oldValue: 0.03,
					newValue: 0.0315,
					percentChange: 5,
				},
				{
					field: "context",
					oldValue: 128000,
					newValue: 129000,
					percentChange: 0.8,
				},
				{
					field: "maxOutput",
					oldValue: 4096,
					newValue: 4200,
					percentChange: 2.5,
				},
			];

			const change = changes[Math.floor(Math.random() * changes.length)];

			const newChange: ChangeHistory = {
				id: Date.now().toString(),
				timestamp: now.toISOString(),
				provider:
					providers[Math.floor(Math.random() * providers.length)],
				model: models[Math.floor(Math.random() * models.length)],
				endpoint: "chat.completions",
				...change,
			};

			setChangeHistory((prev) => [newChange, ...prev.slice(0, 49)]); // Keep last 50 changes
		}, 30000); // Add new change every 30 seconds

		return () => clearInterval(interval);
	}, []);

	return (
		<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
			<TabsList className="grid w-full grid-cols-2">
				<TabsTrigger value="table">Endpoints Table</TabsTrigger>
				<TabsTrigger value="timeline">Change History</TabsTrigger>
			</TabsList>

			<TabsContent value="table" className="mt-6">
				<MonitorDataTable data={modelData} loading={false} />
			</TabsContent>

			<TabsContent value="timeline" className="mt-6">
				<MonitorHistoryClient data={changeHistory} />
			</TabsContent>
		</Tabs>
	);
}
