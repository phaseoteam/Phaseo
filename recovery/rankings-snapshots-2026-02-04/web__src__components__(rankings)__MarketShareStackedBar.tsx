"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import type { MarketShareTimeseriesData } from "@/lib/fetchers/rankings/getRankingsData";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { assignSeriesColours, keyForSeries } from "@/components/(rankings)/chart-colors";

type MarketShareStackedBarProps = {
	data: MarketShareTimeseriesData[];
	dimension: "organization" | "provider";
	metric?: "requests" | "tokens";
	normalizeToPercent?: boolean;
};

