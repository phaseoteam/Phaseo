"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	ResponsiveContainer,
	LineChart,
	Line,
	XAxis,
	YAxis,
	Tooltip,
	Legend,
} from "recharts";

const SAMPLE_DATA = [
	{ date: "2024-11", us: 0.35, china: 0.28 },
	{ date: "2024-12", us: 0.41, china: 0.33 },
	{ date: "2025-01", us: 0.48, china: 0.42 },
	{ date: "2025-02", us: 0.55, china: 0.46 },
	{ date: "2025-03", us: 0.58, china: 0.49 },
	{ date: "2025-04", us: 0.62, china: 0.52 },
	{ date: "2025-05", us: 0.67, china: 0.57 },
	{ date: "2025-06", us: 0.7, china: 0.6 },
];

export default function USvsChinaCard({
	data = SAMPLE_DATA,
}: {
	data?: Array<{ date: string; us: number; china: number }>;
}) {
	const COLORS = {
		us: "#6366f1",
		china: "#f97316",
	};

	return (
		<Card className="border-none bg-white/70 shadow-sm ring-1 ring-inset ring-zinc-200/60 backdrop-blur-sm dark:bg-zinc-950/60 dark:ring-zinc-800/60">
			<CardHeader className="pb-2">
				<CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
					US vs China — Composite SOTA
				</CardTitle>
				<CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
					Share of top benchmark placements (percentage of tracked leaderboards)
				</CardDescription>
			</CardHeader>
			<CardContent className="h-48">
				<ResponsiveContainer width="100%" height="100%">
					<LineChart data={data}>
						<XAxis dataKey="date" hide />
						<YAxis hide />
						<Tooltip
							cursor={{ strokeDasharray: "3 3" }}
							contentStyle={{
								backgroundColor: "rgba(24, 24, 27, 0.92)",
								border: "1px solid rgba(63, 63, 70, 0.45)",
								borderRadius: "12px",
								color: "rgb(250, 250, 250)",
								boxShadow: "0 20px 45px rgba(15, 23, 42, 0.18)",
							}}
							labelStyle={{
								color: "rgba(244, 244, 245, 0.85)",
								fontWeight: 600,
							}}
							formatter={(value, name) => {
								const numericValue =
									typeof value === "number" ? value : Number(value ?? 0);
								return [`${Math.round(numericValue * 100)}%`, String(name ?? "")];
							}}
						/>
						<Legend />
						<Line
							type="monotone"
							dataKey="us"
							name="United States"
							dot={false}
							stroke={COLORS.us}
							strokeWidth={2.5}
							activeDot={{ r: 6 }}
						/>
						<Line
							type="monotone"
							dataKey="china"
							name="China"
							dot={false}
							stroke={COLORS.china}
							strokeWidth={2.5}
							activeDot={{ r: 6 }}
						/>
					</LineChart>
				</ResponsiveContainer>
			</CardContent>
		</Card>
	);
}
