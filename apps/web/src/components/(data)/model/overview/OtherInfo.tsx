import type { ReactNode } from "react";

interface ModelDetail {
	detail_name: string;
	detail_value: string | number | null;
}

interface OtherInfoProps {
	// Accept the older single value for compatibility, or an array of detail objects
	details?: ModelDetail[] | null;
	showHeading?: boolean;
	showEmpty?: boolean;
	extraItems?: Array<{
		key: string;
		label: string;
		value: ReactNode;
	}>;
}

export default function OtherInfo({
	details,
	showHeading = true,
	showEmpty = false,
	extraItems = [],
}: OtherInfoProps) {
	const detailsMap: Record<string, string> = {};
	if (Array.isArray(details)) {
		for (const d of details) {
			if (!d) continue;
			const name = d.detail_name || "";
			const value = d.detail_value == null ? "" : String(d.detail_value);
			detailsMap[name] = value;
		}
	}

	const resolve = (key: string) => {
		if (!Array.isArray(details)) {
			if (
				key === "parameter_count" &&
				(typeof details === "number" || typeof details === "string")
			) {
				return String(details);
			}
			return undefined;
		}
		return detailsMap[key];
	};

	const formatCount = (value?: number | string) => {
		if (value === "" || value == null || value === 0) return null;
		const num = Number(value);
		if (!Number.isFinite(num)) return null;
		return num.toLocaleString();
	};

	const parameterCount = resolve("parameter_count");
	const license = resolve("license");
	const trainingTokens = resolve("training_tokens");

	const items = [
		{
			key: "parameters",
			label: "Parameters",
			value: formatCount(parameterCount),
		},
		{
			key: "license",
			label: "License",
			value: license && license.trim().length > 0 ? license : null,
		},
		{
			key: "training_tokens",
			label: "Training Tokens",
			value: formatCount(trainingTokens),
		},
		...extraItems,
	];
	const visibleItems = showEmpty
		? items
		: items.filter((item) => Boolean(item.value));
	if (visibleItems.length === 0) return null;

	const secondaryStartIndex = visibleItems.findIndex(
		(item) => item.key === "input_modalities",
	);
	const primaryItems =
		secondaryStartIndex >= 0
			? visibleItems.slice(0, secondaryStartIndex)
			: visibleItems;
	const secondaryItems =
		secondaryStartIndex >= 0 ? visibleItems.slice(secondaryStartIndex) : [];

	const renderGrid = (
		groupItems: typeof visibleItems,
		gridClassName: string,
	) => (
		<div
			className={[
				"grid overflow-hidden rounded-lg border border-border/70 bg-card",
				gridClassName,
			].join(" ")}
		>
			{groupItems.map((item) => {
				const isEmpty = !item.value;
				return (
				<div
					key={item.key}
					className="min-w-0 border-b border-border/70 px-3 py-2.5 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
				>
					<p className="text-xs text-muted-foreground">{item.label}</p>
					{typeof item.value === "string" || typeof item.value === "number" || item.value == null ? (
						<p className={isEmpty ? "mt-1 text-sm font-medium text-muted-foreground" : "mt-1 text-sm font-semibold"}>
							{item.value ?? "Not listed"}
						</p>
					) : (
						item.value
					)}
				</div>
				);
			})}
		</div>
	);

	return (
		<section className="space-y-2">
			{showHeading ? <h3 className="text-base font-semibold">Other Info</h3> : null}
			<div className="space-y-2 xl:grid xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:gap-2 xl:space-y-0">
				{renderGrid(primaryItems, "sm:grid-cols-3")}
				{secondaryItems.length > 0
					? renderGrid(secondaryItems, "sm:grid-cols-2")
					: null}
			</div>
		</section>
	);
}
