import { cn } from "@/lib/utils";

const HATCH = "repeating-linear-gradient(135deg, currentColor 0 2px, transparent 2px 4.5px)";

/**
 * Usage so far (solid), the projection to the end of the window (hatched in the
 * same colour) and the limit (a tick). Only the projection past the limit turns
 * amber, so the colour change always means "on course to hit the limit".
 */
export function ForecastMeter({
	used,
	projected,
	limit,
	label,
	className,
}: {
	used: number;
	projected?: number | null;
	limit?: number | null;
	label: string;
	className?: string;
}) {
	const hasLimit = typeof limit === "number" && limit > 0;
	const projection = typeof projected === "number" && projected > used ? projected : used;
	const scale = Math.max(hasLimit ? limit : 0, projection, used) * (hasLimit || projection > used ? 1.08 : 1);
	const percent = (value: number) => (scale > 0 ? Math.min(100, (value / scale) * 100) : 0);

	const usedEnd = percent(used);
	const projectedEnd = percent(projection);
	const limitAt = hasLimit ? percent(limit) : null;
	const withinLimitEnd = limitAt === null ? projectedEnd : Math.min(projectedEnd, Math.max(usedEnd, limitAt));
	const overLimitStart = limitAt === null ? null : Math.max(usedEnd, limitAt);

	return (
		<div role="img" aria-label={label} className={cn("relative py-[3px]", className)}>
			<div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
				<div className="absolute inset-y-0 left-0 rounded-full bg-chart-4" style={{ width: `${usedEnd}%` }} />
				{withinLimitEnd > usedEnd ? (
					<div
						className="absolute inset-y-0 text-chart-4/85"
						style={{ left: `${usedEnd}%`, width: `${withinLimitEnd - usedEnd}%`, backgroundImage: HATCH }}
					/>
				) : null}
				{overLimitStart !== null && projectedEnd > overLimitStart ? (
					<div
						className="absolute inset-y-0 text-amber-500"
						style={{ left: `${overLimitStart}%`, width: `${projectedEnd - overLimitStart}%`, backgroundImage: HATCH }}
					/>
				) : null}
			</div>
			{limitAt !== null ? (
				<div
					aria-hidden="true"
					className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
					style={{ left: `${limitAt}%` }}
				/>
			) : null}
		</div>
	);
}
