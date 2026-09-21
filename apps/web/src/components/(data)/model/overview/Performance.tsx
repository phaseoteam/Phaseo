interface ModelDetail {
	// Support both new and legacy shapes
	detail_name?: string;
	detail_value?: string | number | null;
	name?: string;
	value?: string | number | null;
}

interface PerformanceProps {
	details?: ModelDetail[] | null;
}

export default function Performance({ details }: PerformanceProps) {
	const detailsMap: Record<string, string> = {};

	// details are passed in from model.model_details; no logging in production

	if (Array.isArray(details)) {
		for (const d of details) {
			if (!d) continue;
			// pick the canonical key name and value from whichever shape is provided
			const key = (d.detail_name ?? d.name) as string | undefined;
			const rawVal = d.detail_value ?? d.value ?? "";
			if (!key) continue;
			// normalize to string for storage
			detailsMap[key] = rawVal == null ? "" : String(rawVal);
		}
	}

	const resolveNum = (key: string) => {
		const v = detailsMap[key];
		if (v == null || v === "") return undefined;
		// Accept very large integers provided as strings by parsing as Number where possible
		// but guard against NaN and Infinity
		const n = Number(v);
		return Number.isFinite(n) ? n : undefined;
	};

	const resolveStr = (key: string) => {
		const v = detailsMap[key];
		return v == null || v === "" ? undefined : v;
	};

	const inputCtx = resolveNum("input_context_length");
	const outputCtx = resolveNum("output_context_length");
	const knowledgeCutoff = resolveStr("knowledge_cutoff");
	return (
		<div className="flex flex-col">
			<h2 className="text-xl font-semibold mb-4">Performance</h2>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-2">
				{/* Input Context Window Card */}
				<div className="p-4 flex flex-col items-center justify-center border border-gray-200 dark:border-gray-700 border-b-2 border-b-gray-300 dark:border-b-gray-600 rounded-lg h-full">
					<span className="text-xl font-bold">
						{inputCtx != null ? <><DisplayNumber value={inputCtx} /> tokens</> : "-"}
					</span>
					<span className="text-sm font-medium text-gray-500 mt-1">
						Input Context
					</span>
				</div>
				{/* Output Context Window Card */}
				<div className="p-2 flex flex-col items-center justify-center border border-gray-200 dark:border-gray-700 border-b-2 border-b-gray-300 dark:border-b-gray-600 rounded-lg">
					<span className="text-xl font-bold">
						{outputCtx != null ? <><DisplayNumber value={outputCtx} /> tokens</> : "-"}
					</span>
					<span className="text-sm font-medium text-gray-500 mt-1">
						Output Context
					</span>
				</div>
				{/* Knowledge Cutoff Card (replaces Latency) */}
				<div className="p-2 flex flex-col items-center justify-center border border-gray-200 dark:border-gray-700 border-b-2 border-b-gray-300 dark:border-b-gray-600 rounded-lg">
					<span className="text-xl font-bold">
						{knowledgeCutoff ? <DisplayCalendarDate value={knowledgeCutoff} /> : "-"}
					</span>
					<span className="text-sm font-medium text-gray-500 mt-1">
						Knowledge Cutoff
					</span>
				</div>
			</div>
		</div>
	);
}
import { DisplayCalendarDate, DisplayNumber } from "@/components/display/DisplayValue";
