import fs from "fs";
import path from "path";
import { Suspense } from "react";
import {
	MonitorHistoryClient,
	type ChangeHistory,
} from "@/components/monitor/MonitorHistoryClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Monitor - Change History",
	description:
		"Track recent changes across models, providers, pricing, and data updates on AI Stats.",
	keywords: [
		"AI model changes",
		"AI updates",
		"AI pricing changes",
		"AI Stats monitor",
		"AI Stats",
	],
	alternates: {
		canonical: "/monitor",
	},
};

export const cacheLife = "days";

const getMonitorHistory = async (): Promise<ChangeHistory[]> => {
	const filePath = path.join(
		process.cwd(),
		"src",
		"data",
		"monitor-history.json"
	);

	try {
		const json = await fs.promises.readFile(filePath, "utf8");
		const parsed = JSON.parse(json) as
			| ChangeHistory[]
			| { entries?: ChangeHistory[] };
		return Array.isArray(parsed) ? parsed : parsed.entries ?? [];
	} catch (_) {
		return [];
	}
};

const filterHistory = (
	data: ChangeHistory[],
	type: "all" | "model" | "endpoint",
	entity: string
) => {
	return data.filter((change) => {
		if (type === "model" && change.endpoint) return false;
		if (type === "endpoint" && !change.endpoint) return false;
		if (entity !== "all" && change.model !== entity) return false;
		return true;
	});
};

type MonitorPageProps = {
	searchParams?: Promise<{
		type?: string;
		entity?: string;
	}>;
};

function MonitorHistorySkeleton() {
	return (
		<div className="space-y-4">
			<div className="h-4 w-40 rounded bg-muted/40" />
			{Array.from({ length: 6 }).map((_, index) => (
				<div
					key={index}
					className="h-10 rounded border border-dashed border-muted/50 bg-muted/10"
				/>
			))}
		</div>
	);
}

async function MonitorHistorySection({
	changeType,
	entityFilter,
}: {
	changeType: "all" | "model" | "endpoint";
	entityFilter: string;
}) {
	const allData = await getMonitorHistory();
	const filteredData = filterHistory(allData, changeType, entityFilter);

	return <MonitorHistoryClient data={filteredData} />;
}

export default function MonitorPage({ searchParams }: MonitorPageProps) {
	return (
		<Suspense fallback={<MonitorHistorySkeleton />}>
			<MonitorPageContent searchParams={searchParams} />
		</Suspense>
	);
}

async function MonitorPageContent({ searchParams }: MonitorPageProps) {
	const params = (await searchParams) ?? {};
	const typeParam = params?.type;
	const entityParam = params?.entity;

	const changeType: "all" | "model" | "endpoint" =
		typeParam === "model" || typeParam === "endpoint" ? typeParam : "all";
	const entityFilter = entityParam ?? "all";

	return (
		<div className="container mx-auto px-4 py-8 space-y-6">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<h1 className="font-bold text-xl">Change History</h1>
				</div>
			</div>

			<Suspense fallback={<MonitorHistorySkeleton />}>
				<MonitorHistorySection
					changeType={changeType}
					entityFilter={entityFilter}
				/>
			</Suspense>
		</div>
	);
}
