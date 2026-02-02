// components/(rankings)/MarketShareVisualizations.tsx
// Purpose: Pie chart showing market share breakdown
// Why: Visual representation of organization/provider dominance
// How: Uses Recharts PieChart with custom colors

"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import type { MarketShareData } from "@/lib/fetchers/rankings/getRankingsData";

interface MarketShareVisualizationsProps {
    data: MarketShareData[];
    dimension: "organization" | "provider";
}

// Pastel color palette for pie charts
const COLORS = [
    "hsl(210, 70%, 75%)", // Blue
    "hsl(340, 65%, 75%)", // Pink
    "hsl(160, 60%, 70%)", // Teal
    "hsl(40, 75%, 75%)", // Yellow
    "hsl(280, 60%, 75%)", // Purple
    "hsl(20, 70%, 75%)", // Orange
    "hsl(140, 55%, 70%)", // Green
    "hsl(200, 65%, 75%)", // Sky
    "hsl(320, 60%, 75%)", // Magenta
    "hsl(60, 65%, 75%)", // Lime
];

export function MarketShareVisualizations({
    data,
    dimension,
}: MarketShareVisualizationsProps) {
    const chartData = data.map((row, idx) => ({
        name: row.name,
        value: row.share_pct,
        requests: row.requests,
        tokens: row.tokens,
        fill: COLORS[idx % COLORS.length],
    }));

    return (
        <Card className="p-4">
            <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                    <Pie
                        data={chartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={(entry) => `${entry.name}: ${entry.value.toFixed(1)}%`}
                        labelLine={true}
                    >
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                    </Pie>
                    <Tooltip
                        content={({ payload }) => {
                            if (!payload?.[0]) return null;
                            const data = payload[0].payload;
                            return (
                                <Card className="p-3 shadow-lg border">
                                    <div className="space-y-1">
                                        <p className="font-semibold">{data.name}</p>
                                        <div className="text-sm space-y-1 pt-2 border-t">
                                            <p>Share: {data.value.toFixed(1)}%</p>
                                            <p>Requests: {data.requests.toLocaleString()}</p>
                                            <p>
                                                Tokens:{" "}
                                                {data.tokens >= 1e9
                                                    ? `${(data.tokens / 1e9).toFixed(2)}B`
                                                    : data.tokens >= 1e6
                                                    ? `${(data.tokens / 1e6).toFixed(2)}M`
                                                    : data.tokens.toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </Card>
                            );
                        }}
                    />
                    <Legend />
                </PieChart>
            </ResponsiveContainer>
        </Card>
    );
}
