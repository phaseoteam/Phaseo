interface ModelDetail {
	detail_name: string;
	detail_value: string | number | null;
}

interface OtherInfoProps {
	// Accept the older single value for compatibility, or an array of detail objects
	details?: ModelDetail[] | null;
	showHeading?: boolean;
}

export default function OtherInfo({
	details,
	showHeading = true,
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
	].filter((item) => Boolean(item.value));
	const hasSingleItem = items.length === 1;

	if (items.length === 0) return null;

	return (
		<section className="space-y-2">
			{showHeading ? <h3 className="text-base font-semibold">Other Info</h3> : null}
			<div className="flex flex-wrap gap-2">
				{items.map((item) => (
					<div
						key={item.key}
						className={
							hasSingleItem
								? "w-full max-w-sm rounded-md border border-border/70 bg-muted/20 px-3 py-2"
								: "min-w-[12rem] rounded-md border border-border/70 bg-muted/20 px-3 py-2"
						}
					>
						<p className="text-xs text-muted-foreground">{item.label}</p>
						<p className="mt-1 text-sm font-semibold">{item.value}</p>
					</div>
				))}
			</div>
		</section>
	);
}
