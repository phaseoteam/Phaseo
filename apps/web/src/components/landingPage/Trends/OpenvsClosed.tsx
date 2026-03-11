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
	AreaChart,
	Area,
	XAxis,
	YAxis,
	Tooltip,
	Legend,
} from "recharts";

const SAMPLE_DATA = [
	{ date: "2024-11", open: 0.22, closed: 0.31 },
	{ date: "2024-12", open: 0.27, closed: 0.35 },
	{ date: "2025-01", open: 0.33, closed: 0.39 },
	{ date: "2025-02", open: 0.37, closed: 0.44 },
	{ date: "2025-03", open: 0.42, closed: 0.46 },
	{ date: "2025-04", open: 0.45, closed: 0.5 },
	{ date: "2025-05", open: 0.49, closed: 0.53 },
	{ date: "2025-06", open: 0.52, closed: 0.55 },
];

export default function OpenVsClosedCard({
	data = SAMPLE_DATA,
}: {
	data?: Array<{ date: string; open: number; closed: number }>;
}) {
	return (
		<Card className="border-none bg-white/70 shadow-sm ring-1 ring-inset ring-zinc-200/60 backdrop-blur-sm dark:bg-zinc-950/60 dark:ring-zinc-800/60">
			<CardHeader className="pb-2">
				<CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
					Open Source vs Proprietary
				</CardTitle>
				<CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
					Share of new releases crossing our prominence threshold
				</CardDescription>
			</CardHeader>
			<CardContent className="h-48">
				<ResponsiveContainer width="100%" height="100%">
					<AreaChart data={data} stackOffset="expand">
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
								return [
									`${Math.round(numericValue * 100)}% share`,
									String(name ?? ""),
								];
							}}
						/>
						<defs>
							<linearGradient id="openFill" x1="0" y1="0" x2="0" y2="1">
								<stop offset="5%" stopColor="#22c55e" stopOpacity={0.9} />
								<stop offset="95%" stopColor="#22c55e" stopOpacity={0.2} />
							</linearGradient>
							<linearGradient id="closedFill" x1="0" y1="0" x2="0" y2="1">
								<stop offset="5%" stopColor="#f97316" stopOpacity={0.85} />
								<stop offset="95%" stopColor="#f97316" stopOpacity={0.2} />
							</linearGradient>
						</defs>
						<Legend />
						<Area
							type="monotone"
							dataKey="open"
							name="Open Source"
							stackId="1"
							stroke="#22c55e"
							fill="url(#openFill)"
							fillOpacity={0.9}
						/>
						<Area
							type="monotone"
							dataKey="closed"
							name="Proprietary"
							stackId="1"
							stroke="#f97316"
							fill="url(#closedFill)"
							fillOpacity={0.85}
						/>
					</AreaChart>
				</ResponsiveContainer>
			</CardContent>
		</Card>
	);
}
