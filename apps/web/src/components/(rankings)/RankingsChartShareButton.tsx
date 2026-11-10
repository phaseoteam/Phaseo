import type { ReactNode, RefObject } from "react";

import ChartShareButton, {
	type ChartShareRenderSize,
	type ChartShareSeriesOptions,
	type ChartShareSeriesSelection,
} from "@/components/share/ChartShareButton";
import { usePathname } from "@/i18n/navigation";
import type { ChartShareState } from "@/lib/share/chartShare";

/** Where a rankings chart lives, so its share link opens the right tab and section. */
export type RankingsChartShare = {
	section: string;
	chartId: string;
	title: string;
};

type Props = RankingsChartShare & {
	renderForShare?: (size: ChartShareRenderSize, selection: ChartShareSeriesSelection) => ReactNode;
	series?: ChartShareSeriesOptions;
	targetRef?: RefObject<HTMLElement | null>;
	subtitle?: string | null;
	state?: ChartShareState;
	legend?: Array<{ label: string; color: string }>;
	className?: string;
};

export default function RankingsChartShareButton({ section, chartId, state, ...props }: Props) {
	// Locale-free path, such as `/rankings` or `/rankings/image`.
	const path = usePathname();
	// No caption: the chart title says enough, and the footer link names the rankings page.
	return <ChartShareButton {...props} target={{ path, section, chartId, state, campaign: "rankings_chart" }} />;
}
