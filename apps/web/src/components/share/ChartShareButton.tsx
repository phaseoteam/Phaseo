"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronDown, Copy, Download, Link2, Moon, Share2, Sun } from "lucide-react";
import ChartSeriesPicker, { type ChartShareSeries } from "@/components/share/ChartSeriesPicker";
import { toast } from "sonner";

import { LinkedInBrandIcon, XBrandIcon } from "@/components/icons/SocialBrandIcons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { captureProductEvent } from "@/lib/productAnalytics";
import {
	buildChartShareFileName,
	buildChartShareUrl,
	displayChartPath,
	type ChartShareChannel,
	type ChartShareTarget,
} from "@/lib/share/chartShare";
import {
	applyChartShareTheme,
	currentShareTheme,
	getChartShareSlotSize,
	renderChartShareImage,
	type ChartShareTheme,
} from "@/lib/share/renderChartShareImage";
import { cn } from "@/lib/utils";

/** CSS size a share render must fill: the chart area of the image. */
export type ChartShareRenderSize = { width: number; height: number };

/**
 * Which series the image shows. `keys: null` means all of them. Series not in `keys` are folded into the chart's
 * "Other" group so totals stay true. With `highlight`, only that series keeps its colour and the rest is "Other".
 */
export type ChartShareSeriesSelection = { keys: string[] | null; highlight: string | null };

/** A chart's series, for the "Series" and "Highlight" choices in the dialog. */
export type ChartShareSeriesOptions = {
	/** All series, largest first, with the colours the chart uses. */
	items: ChartShareSeries[];
	otherLabel: string;
	otherColor: string;
	/** True when the chart already has an "Other" group of its own. */
	hasOther: boolean;
};

/** Charts with more series than this offer Top 5 / Top 10 / Choose; the image never shows more than this many. */
const SERIES_LIMIT = 10;
type SeriesMode = "top5" | "top10" | "custom";

export type ChartShareButtonProps = {
	/**
	 * Draws the chart at exactly `size`, without its toolbar. Mounted off-screen in the chosen theme and captured, so
	 * the image looks the same on every screen. Charts should pass their size to `ChartContainer`'s `initialDimension`.
	 */
	renderForShare?: (size: ChartShareRenderSize, selection: ChartShareSeriesSelection) => ReactNode;
	/** Adds "Series" and "Highlight" choices. The chart must honour the selection in `renderForShare`. */
	series?: ChartShareSeriesOptions;
	/** Fallback when there is no `renderForShare`: the on-screen element to capture as it is. */
	targetRef?: RefObject<HTMLElement | null>;
	target: ChartShareTarget;
	/** Optional first line of the image, such as `OpenAI: GPT-6.1 Terra`. */
	caption?: string | null;
	title: string;
	/** Current settings in words, such as `Effective · Input tokens · 1 month`. */
	subtitle?: string | null;
	/** Series names and colours, for charts whose legend sits outside `targetRef`. */
	legend?: Array<{ label: string; color: string }>;
	size?: "sm" | "md";
	className?: string;
};

type Rendered = { blob: Blob; url: string };

const THEME_STORAGE_KEY = "phaseo:chart-share-theme";

function readStoredTheme(): ChartShareTheme | null {
	try {
		const value = window.localStorage.getItem(THEME_STORAGE_KEY);
		return value === "light" || value === "dark" ? value : null;
	} catch {
		return null;
	}
}

function storeTheme(theme: ChartShareTheme) {
	try {
		window.localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		// Storage blocked; the choice lasts until the dialog closes.
	}
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Waits for the off-screen chart to finish drawing. Recharts lays out over several commits (axes, then series), and a
 * throttled background tab can stretch those out, so wait until the drawing stops changing rather than a fixed delay.
 */
async function waitForChartToSettle(host: HTMLElement, timeoutMs = 8000) {
	const started = performance.now();
	let previous = -1;
	let stableChecks = 0;
	while (performance.now() - started < timeoutMs) {
		await sleep(60);
		const count = host.querySelectorAll("svg *").length;
		if (count > 0 && count === previous) {
			stableChecks += 1;
			if (stableChecks >= 2) return;
		} else {
			stableChecks = 0;
		}
		previous = count;
	}
}

/** Converts any CSS colour the browser understands (oklch, color-mix, …) to `rgba()`, via a 1x1 canvas. */
function toRgba(color: string, context: CanvasRenderingContext2D): string | null {
	context.clearRect(0, 0, 1, 1);
	context.fillStyle = "rgba(0, 0, 0, 0)";
	context.fillStyle = color;
	context.fillRect(0, 0, 1, 1);
	const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
	return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 1000) / 1000})`;
}

/**
 * Prepares gridlines on the throwaway off-screen share render, right before capture:
 * - Rounds positions to the nearest half CSS pixel. The image is drawn at 2x, so a 1px line on a half pixel fills exactly
 *   two device rows, while evenly spaced lines on quarter pixels smear across three rows and look fainter.
 * - Writes the computed stroke onto the line. The site recolours Recharts' default `#ccc` grid through a CSS rule, which
 *   the snapshot loses, so dark images would otherwise get light grey gridlines.
 */
function prepareGridLines(host: HTMLElement) {
	const snap = (value: string | null) => (value == null || value === "" ? value : String(Math.round(Number(value) * 2) / 2));
	const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
	for (const line of host.querySelectorAll<SVGLineElement>(".recharts-cartesian-grid line")) {
		for (const attribute of ["x1", "x2", "y1", "y2"]) {
			const snapped = snap(line.getAttribute(attribute));
			if (snapped != null && snapped !== "NaN") line.setAttribute(attribute, snapped);
		}
		// A theme switch re-captures the same render, so restore the original stroke before reading the new one.
		line.dataset.shareStroke ??= line.getAttribute("stroke") ?? "";
		line.setAttribute("stroke", line.dataset.shareStroke);
		line.style.removeProperty("stroke");
		const stroke = context ? toRgba(getComputedStyle(line).stroke, context) : null;
		if (stroke) {
			line.setAttribute("stroke", stroke);
			line.style.stroke = stroke;
		}
	}
}

export default function ChartShareButton({ renderForShare, series, targetRef, target, caption, title, subtitle, legend, size = "md", className }: ChartShareButtonProps) {
	const t = useTranslations("Common.ui.chartShare");
	const locale = useLocale();

	// Series choices: which series to show, and an optional highlight.
	const seriesItems = series?.items ?? [];
	const canPickSeries = seriesItems.length > SERIES_LIMIT;
	const [seriesMode, setSeriesMode] = useState<SeriesMode>("top10");
	const [customKeys, setCustomKeys] = useState<string[]>([]);
	const [highlightKey, setHighlightKey] = useState<string | null>(null);
	const highlight = highlightKey && seriesItems.some((item) => item.key === highlightKey) ? highlightKey : null;
	const shownKeys: string[] | null = !series
		? null
		: highlight
			? [highlight]
			: !canPickSeries
				? null
				: seriesMode === "top5"
					? seriesItems.slice(0, 5).map((item) => item.key)
					: seriesMode === "custom" && customKeys.length
						? seriesItems.filter((item) => customKeys.includes(item.key)).map((item) => item.key)
						: seriesItems.slice(0, SERIES_LIMIT).map((item) => item.key);
	const selection: ChartShareSeriesSelection = { keys: shownKeys, highlight };
	// Effects key on this string, so a new selection object each render doesn't restart the capture.
	const selectionKey = JSON.stringify(selection);

	// The legend follows the selection: shown series, then "Other" for everything folded into it.
	const seriesLegend = (() => {
		if (!series) return null;
		const shown = shownKeys ? seriesItems.filter((item) => shownKeys.includes(item.key)) : seriesItems;
		const hidesSome = shown.length < seriesItems.length;
		return [
			...shown.map(({ label, color }) => ({ label, color })),
			...(series.hasOther || hidesSome ? [{ label: series.otherLabel, color: series.otherColor }] : []),
		];
	})();

	// Parents rebuild the legend array each render; key it by content so an open dialog doesn't redraw.
	const legendKey = JSON.stringify(seriesLegend ?? legend ?? []);
	const stableLegend = useMemo(() => JSON.parse(legendKey) as Array<{ label: string; color: string }>, [legendKey]);
	const [open, setOpen] = useState(false);
	const [theme, setTheme] = useState<ChartShareTheme>("light");
	const [rendered, setRendered] = useState<Rendered | null>(null);
	const [failed, setFailed] = useState(false);
	const [copied, setCopied] = useState<"link" | "image" | null>(null);
	const [canNativeShare, setCanNativeShare] = useState(false);
	const renderId = useRef(0);
	const shareHostRef = useRef<HTMLDivElement>(null);
	const hasShareRender = Boolean(renderForShare);
	const slotSize = useMemo(() => getChartShareSlotSize({ hasLegend: stableLegend.length > 0 }), [stableLegend.length]);

	// The off-screen share render takes the chosen theme's tokens before each capture.
	useLayoutEffect(() => {
		if (open && shareHostRef.current) applyChartShareTheme(shareHostRef.current, theme);
	}, [open, theme]);

	const footnote = t("dataAsOf", {
		date: new Date().toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }),
	});

	const render = useCallback(async () => {
		const id = ++renderId.current;
		try {
			const node = hasShareRender ? shareHostRef.current : targetRef?.current;
			if (!node) throw new Error("Nothing to capture");
			if (hasShareRender) {
				await waitForChartToSettle(node);
				prepareGridLines(node);
			}
			if (id !== renderId.current) return;
			const blob = await renderChartShareImage({
				node,
				nodeIsThemed: hasShareRender,
				caption,
				title,
				subtitle,
				legend: stableLegend,
				theme,
				footnote,
				pagePath: displayChartPath(target.path),
			});
			if (id !== renderId.current) return;
			setRendered({ blob, url: URL.createObjectURL(blob) });
			const file = new File([blob], "chart.png", { type: "image/png" });
			setCanNativeShare(typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }) && matchMedia("(pointer: coarse)").matches);
		} catch {
			if (id === renderId.current) setFailed(true);
		}
		// `renderForShare` is usually an inline function; depending on it would restart the capture on every parent render.
	}, [caption, footnote, hasShareRender, stableLegend, subtitle, target.path, targetRef, theme, title]);

	// Re-capture when the series selection changes: the off-screen chart has re-rendered by the time this runs.
	useEffect(() => {
		if (open) void render();
		else renderId.current += 1;
	}, [open, render, selectionKey]);

	useEffect(() => () => {
		if (rendered) URL.revokeObjectURL(rendered.url);
	}, [rendered]);

	/** Clears the preview before a new image is drawn, so the spinner shows instead of a stale image. */
	const resetPreview = () => {
		setFailed(false);
		setRendered((previous) => {
			if (previous) URL.revokeObjectURL(previous.url);
			return null;
		});
	};

	const onOpenChange = (next: boolean) => {
		// Pick the theme as the dialog opens, so the first render already uses it.
		if (next) {
			resetPreview();
			setTheme(readStoredTheme() ?? currentShareTheme());
		}
		setOpen(next);
	};

	const chooseTheme = (next: ChartShareTheme) => {
		if (next === theme) return;
		storeTheme(next);
		resetPreview();
		setTheme(next);
	};

	const chooseSeriesMode = (next: SeriesMode) => {
		if (next === seriesMode && next !== "custom") return;
		resetPreview();
		setSeriesMode(next);
	};

	const chooseCustomKeys = (keys: string[]) => {
		resetPreview();
		setCustomKeys(keys);
		setSeriesMode("custom");
	};

	const chooseHighlight = (keys: string[]) => {
		resetPreview();
		setHighlightKey(keys[0] ?? null);
	};

	const retry = () => {
		resetPreview();
		void render();
	};

	const track = (channel: ChartShareChannel) =>
		captureProductEvent("chart_shared", { campaign: target.campaign, chart_id: target.chartId, channel, page_path: target.path });
	const flash = (kind: "link" | "image") => {
		setCopied(kind);
		window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 2000);
	};

	const copyImage = async (silent = false) => {
		if (!rendered) return false;
		try {
			await navigator.clipboard.write([new ClipboardItem({ "image/png": rendered.blob })]);
			if (!silent) flash("image");
			return true;
		} catch {
			if (!silent) toast.error(t("copyBlocked"));
			return false;
		}
	};

	const shareText = caption ? t("shareText", { caption, chart: title }) : t("shareTextChart", { chart: title });

	const actions = {
		copyImage: async () => {
			if (await copyImage()) track("copy_image");
		},
		// Start the copy while the page still has focus, then open the composer in the same click so it is not blocked as a popup.
		postOnX: async () => {
			const copying = copyImage(true);
			const url = new URL("https://x.com/intent/post");
			url.searchParams.set("text", shareText);
			url.searchParams.set("url", buildChartShareUrl(target, "x"));
			window.open(url.toString(), "_blank", "noopener,noreferrer");
			track("x");
			if (await copying) toast.success(t("imageCopiedForPost"));
		},
		shareOnLinkedIn: async () => {
			const copying = copyImage(true);
			const url = new URL("https://www.linkedin.com/sharing/share-offsite/");
			url.searchParams.set("url", buildChartShareUrl(target, "linkedin"));
			window.open(url.toString(), "_blank", "noopener,noreferrer");
			track("linkedin");
			if (await copying) toast.success(t("imageCopiedForPost"));
		},
		copyLink: async () => {
			try {
				await navigator.clipboard.writeText(buildChartShareUrl(target, "copy_link"));
				flash("link");
				track("copy_link");
			} catch {
				toast.error(t("copyLinkFailed"));
			}
		},
		download: () => {
			if (!rendered) return;
			const anchor = document.createElement("a");
			anchor.href = rendered.url;
			anchor.download = buildChartShareFileName(target);
			anchor.click();
			track("download");
		},
		nativeShare: async () => {
			if (!rendered) return;
			const file = new File([rendered.blob], buildChartShareFileName(target), { type: "image/png" });
			try {
				await navigator.share({ files: [file], title: shareText, text: shareText, url: buildChartShareUrl(target, "native") });
				track("native");
			} catch {
				// Closing the share sheet rejects; nothing to report.
			}
		},
	};

	const ready = Boolean(rendered) && !failed;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{open && renderForShare
				? createPortal(
						<div
							ref={shareHostRef}
							aria-hidden="true"
							inert
							data-chart-share-host=""
							style={{ position: "fixed", left: -100000, top: 0, width: slotSize.width, height: slotSize.height, overflow: "hidden", pointerEvents: "none" }}
						>
							{renderForShare(slotSize, selection)}
						</div>,
						document.body,
					)
				: null}
			<Tooltip delayDuration={200}>
				<TooltipTrigger asChild>
					<DialogTrigger asChild>
						<Button
							type="button"
							variant={size === "md" ? "outline" : "ghost"}
							size="icon"
							data-share-hide
							className={cn(size === "md" ? "size-8 rounded-md" : "size-7 rounded-md text-muted-foreground hover:text-foreground", className)}
							aria-label={t("button", { chart: title })}
						>
							<Share2 className="size-3.5" />
						</Button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent>{t("tooltip")}</TooltipContent>
			</Tooltip>
			<DialogContent className="gap-4 p-4 sm:max-w-2xl sm:p-5">
				<DialogHeader className="pr-8">
					<DialogTitle>{t("title")}</DialogTitle>
					<DialogDescription>{t("description")}</DialogDescription>
				</DialogHeader>

				<div className="flex items-center justify-between gap-3">
					<span id="chart-share-theme-label" className="text-sm text-muted-foreground">{t("theme")}</span>
					<div role="radiogroup" aria-labelledby="chart-share-theme-label" className="inline-flex h-8 rounded-md border bg-background p-0.5">
						{(["light", "dark"] as const).map((option) => (
							<button
								key={option}
								type="button"
								role="radio"
								aria-checked={theme === option}
								onClick={() => chooseTheme(option)}
								className={cn(
									"inline-flex items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors",
									theme === option ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
								)}
							>
								{option === "light" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
								{option === "light" ? t("light") : t("dark")}
							</button>
						))}
					</div>
				</div>

				{series ? (
					<div className="grid gap-2">
						{canPickSeries ? (
							<div className="flex items-center justify-between gap-3">
								<span id="chart-share-series-label" className="text-sm text-muted-foreground">{t("series")}</span>
								<div
									role="radiogroup"
									aria-labelledby="chart-share-series-label"
									className={cn("inline-flex h-8 rounded-md border bg-background p-0.5", highlight && "pointer-events-none opacity-50")}
									aria-disabled={highlight ? true : undefined}
								>
									{(["top5", "top10"] as const).map((option) => (
										<button
											key={option}
											type="button"
											role="radio"
											aria-checked={!highlight && seriesMode === option}
											onClick={() => chooseSeriesMode(option)}
											className={cn(
												"rounded-sm px-2.5 text-xs font-medium transition-colors",
												!highlight && seriesMode === option ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
											)}
										>
											{option === "top5" ? t("top5") : t("top10")}
										</button>
									))}
									<ChartSeriesPicker
										mode="multiple"
										max={SERIES_LIMIT}
										series={seriesItems}
										selected={seriesMode === "custom" && customKeys.length ? customKeys : seriesItems.slice(0, SERIES_LIMIT).map((item) => item.key)}
										onChange={chooseCustomKeys}
										trigger={
											<button
												type="button"
												role="radio"
												aria-checked={!highlight && seriesMode === "custom"}
												className={cn(
													"inline-flex items-center gap-1 rounded-sm px-2.5 text-xs font-medium transition-colors",
													!highlight && seriesMode === "custom" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
												)}
											>
												{seriesMode === "custom" && customKeys.length ? t("chosenCount", { count: customKeys.length, max: SERIES_LIMIT }) : t("choose")}
												<ChevronDown className="size-3" />
											</button>
										}
									/>
								</div>
							</div>
						) : null}
						<div className="flex items-center justify-between gap-3">
							<span className="text-sm text-muted-foreground">{t("highlight")}</span>
							<ChartSeriesPicker
								mode="single"
								series={seriesItems}
								selected={highlight ? [highlight] : []}
								onChange={chooseHighlight}
								noneLabel={t("highlightNone")}
								trigger={
									<Button type="button" variant="outline" size="sm" className="h-8 max-w-[60%] justify-between gap-2 rounded-md px-2.5 text-xs font-normal">
										{highlight ? (
											<span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: seriesItems.find((item) => item.key === highlight)?.color }} />
										) : null}
										<span className="truncate">{highlight ? seriesItems.find((item) => item.key === highlight)?.label : t("highlightNone")}</span>
										<ChevronDown className="size-3.5 shrink-0 opacity-60" />
									</Button>
								}
							/>
						</div>
						{highlight ? <p className="text-xs text-muted-foreground">{t("highlightHint")}</p> : null}
					</div>
				) : null}

				<div className="relative aspect-video overflow-hidden rounded-md border bg-muted/30">
					{rendered ? (
						// eslint-disable-next-line @next/next/no-img-element -- local blob preview
						<img src={rendered.url} alt={t("imageAlt", { chart: title })} className="block size-full object-contain" />
					) : null}
					{!rendered && !failed ? (
						<div className="absolute inset-0 grid place-items-center text-muted-foreground" role="status">
							<Spinner className="size-5" />
							<span className="sr-only">{t("creating")}</span>
						</div>
					) : null}
				</div>

				{failed ? (
					<Alert variant="destructive">
						<AlertDescription className="flex items-center justify-between gap-3">
							{t("failed")}
							<Button type="button" size="sm" variant="outline" className="rounded-md" onClick={retry}>
								{t("tryAgain")}
							</Button>
						</AlertDescription>
					</Alert>
				) : null}

				<div className="grid gap-2">
					{canNativeShare ? (
						<Button type="button" className="h-9 rounded-md" disabled={!ready} onClick={() => void actions.nativeShare()}>
							<Share2 className="size-4" />
							{t("share")}
						</Button>
					) : (
						<Button type="button" className="h-9 rounded-md" disabled={!ready} onClick={() => void actions.copyImage()}>
							{copied === "image" ? <Check className="size-4" /> : <Copy className="size-4" />}
							{copied === "image" ? t("copied") : t("copyImage")}
						</Button>
					)}
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
						<Button type="button" variant="outline" className="h-9 rounded-md" disabled={!ready} onClick={() => void actions.postOnX()} aria-label={t("postOnXLabel")}>
							<XBrandIcon className="size-3.5" />
							{t("postOnX")}
						</Button>
						<Button type="button" variant="outline" className="h-9 rounded-md" disabled={!ready} onClick={() => void actions.shareOnLinkedIn()} aria-label={t("linkedInLabel")}>
							<LinkedInBrandIcon className="size-4" />
							{t("linkedIn")}
						</Button>
						<Button type="button" variant="outline" className="h-9 rounded-md" onClick={() => void actions.copyLink()}>
							{copied === "link" ? <Check className="size-4" /> : <Link2 className="size-4" />}
							{copied === "link" ? t("copied") : t("copyLink")}
						</Button>
						<Button type="button" variant="outline" className="h-9 rounded-md" disabled={!ready} onClick={actions.download}>
							<Download className="size-4" />
							{t("download")}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
