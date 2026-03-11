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
	{
		date: "2025-02",
		openai: 1,
		google: 0,
		anthropic: 1,
		deepseek: 0,
		meta: 0,
		mistral: 1,
	},
	{
		date: "2025-03",
		openai: 0,
		google: 1,
		anthropic: 0,
		deepseek: 1,
		meta: 0,
		mistral: 0,
	},
	{
		date: "2025-04",
		openai: 1,
		google: 0,
		anthropic: 0,
		deepseek: 1,
		meta: 1,
		mistral: 0,
	},
	{
		date: "2025-05",
		openai: 0,
		google: 1,
		anthropic: 1,
		deepseek: 0,
		meta: 1,
		mistral: 1,
	},
	{
		date: "2025-06",
		openai: 1,
		google: 1,
		anthropic: 0,
		deepseek: 1,
		meta: 0,
		mistral: 1,
	},
];

const COLOURS: Record<string, string> = {
	openai: "#6366f1",
	google: "#facc15",
	anthropic: "#ec4899",
	deepseek: "#22d3ee",
	meta: "#3b82f6",
	mistral: "#a855f7",
};

const LABELS: Record<string, string> = {
	openai: "OpenAI",
	google: "Google",
	anthropic: "Anthropic",
	deepseek: "DeepSeek",
	meta: "Meta",
	mistral: "Mistral",
};

export default function OrgsOverTimeCard({
	data = SAMPLE_DATA,
}: {
	data?: Array<Record<string, number | string>>;
}) {
	const keys = Object.keys(LABELS);

	return (
		<Card className="border-none bg-white/70 shadow-sm ring-1 ring-inset ring-zinc-200/60 backdrop-blur-sm dark:bg-zinc-950/60 dark:ring-zinc-800/60">
			<CardHeader className="pb-2">
				<CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
					Organisation Releases (Top 6)
				</CardTitle>
				<CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
					Frequency of notable launches per organisation (rolling 30 days)
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
								const nameKey = String(name ?? "");
								return [
									`${numericValue} releases`,
									LABELS[nameKey] ?? nameKey,
								];
							}}
						/>
						<Legend />
						{keys.map((key) => (
							<Line
								key={key}
								type="monotone"
								dataKey={key}
								name={LABELS[key]}
								dot={false}
								stroke={COLOURS[key]}
								strokeWidth={2}
								activeDot={{ r: 5 }}
							/>
						))}
					</LineChart>
				</ResponsiveContainer>
			</CardContent>
		</Card>
	);
}
