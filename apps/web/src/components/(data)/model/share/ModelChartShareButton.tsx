"use client";

import type { ReactNode, RefObject } from "react";

import ChartShareButton, { type ChartShareRenderSize } from "@/components/share/ChartShareButton";
import type { ChartShareState } from "@/lib/share/chartShare";
import { useModelChartShareModel } from "./ModelChartShareContext";

type Props = {
	renderForShare?: (size: ChartShareRenderSize) => ReactNode;
	targetRef?: RefObject<HTMLElement | null>;
	section: string;
	chartId: string;
	title: string;
	subtitle?: string | null;
	state?: ChartShareState;
	legend?: Array<{ label: string; color: string }>;
	size?: "sm" | "md";
	className?: string;
};

/** Share button for a chart on a model page; hidden outside one. */
export default function ModelChartShareButton({ section, chartId, state, ...props }: Props) {
	const model = useModelChartShareModel();
	if (!model) return null;
	return (
		<ChartShareButton
			{...props}
			caption={model.modelName}
			target={{ path: `/models/${model.modelId}`, section, chartId, state, campaign: "model_chart" }}
		/>
	);
}
