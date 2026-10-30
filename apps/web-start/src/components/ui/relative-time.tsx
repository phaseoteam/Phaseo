"use client";
import { useControllableState } from "@/hooks/use-controllable-state";
import {
	createContext,
	type HTMLAttributes,
	useContext,
	useEffect,
} from "react";
import {
	useDisplayFormatters,
	useDisplayPreferences,
} from "@/components/providers/DisplayPreferencesProvider";
import { cn } from "@/lib/utils";

const STABLE_DEFAULT_TIME = new Date(0);
type RelativeTimeContextType = {
	time: Date;
	dateFormatOptions?: Intl.DateTimeFormatOptions;
	timeFormatOptions?: Intl.DateTimeFormatOptions;
};
const RelativeTimeContext = createContext<RelativeTimeContextType>({
	time: STABLE_DEFAULT_TIME,
	dateFormatOptions: {
		dateStyle: "long",
	},
	timeFormatOptions: {
		hour: "2-digit",
		minute: "2-digit",
	},
});
export type RelativeTimeProps = HTMLAttributes<HTMLDivElement> & {
	time?: Date;
	defaultTime?: Date;
	onTimeChange?: (time: Date) => void;
	dateFormatOptions?: Intl.DateTimeFormatOptions;
	timeFormatOptions?: Intl.DateTimeFormatOptions;
};
export const RelativeTime = ({
	time: controlledTime,
	defaultTime = STABLE_DEFAULT_TIME,
	onTimeChange,
	dateFormatOptions,
	timeFormatOptions,
	className,
	...props
}: RelativeTimeProps) => {
	const [time, setTime] = useControllableState<Date>({
		defaultProp: defaultTime,
		prop: controlledTime,
		onChange: onTimeChange,
	});
	useEffect(() => {
		if (controlledTime) {
			return;
		}
		const interval = setInterval(() => {
			setTime(new Date());
		}, 1000);
		return () => clearInterval(interval);
	}, [setTime, controlledTime]);
	return (
		<RelativeTimeContext.Provider
			value={{
				time: time ?? defaultTime,
				dateFormatOptions,
				timeFormatOptions,
			}}
		>
			<div className={cn("grid gap-2", className)} {...props} />
		</RelativeTimeContext.Provider>
	);
};
export type RelativeTimeZoneProps = HTMLAttributes<HTMLDivElement> & {
	zone: string;
	dateFormatOptions?: Intl.DateTimeFormatOptions;
	timeFormatOptions?: Intl.DateTimeFormatOptions;
};
export type RelativeTimeZoneContextType = {
	zone: string;
};
const RelativeTimeZoneContext = createContext<RelativeTimeZoneContextType>({
	zone: "UTC",
});
export const RelativeTimeZone = ({
	zone,
	className,
	...props
}: RelativeTimeZoneProps) => (
	<RelativeTimeZoneContext.Provider value={{ zone }}>
		<div
			className={cn(
				"flex items-center justify-between gap-1.5 text-xs",
				className
			)}
			{...props}
		/>
	</RelativeTimeZoneContext.Provider>
);
export type RelativeTimeZoneDisplayProps = HTMLAttributes<HTMLDivElement>;
export const RelativeTimeZoneDisplay = ({
	className,
	...props
}: RelativeTimeZoneDisplayProps) => {
	const { time, timeFormatOptions } = useContext(RelativeTimeContext);
	const { zone } = useContext(RelativeTimeZoneContext);
	const format = useDisplayFormatters();
	const display = format.dateParts(time, {
		...(timeFormatOptions ?? {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		}),
		timeZone: zone,
	});
	return (
		<div
			className={cn("pl-8 text-muted-foreground tabular-nums", className)}
			{...props}
		>
			{display}
		</div>
	);
};
export type RelativeTimeZoneDateProps = HTMLAttributes<HTMLDivElement>;
export const RelativeTimeZoneDate = ({
	className,
	...props
}: RelativeTimeZoneDateProps) => {
	const { time, dateFormatOptions } = useContext(RelativeTimeContext);
	const { zone } = useContext(RelativeTimeZoneContext);
	const { preferences } = useDisplayPreferences();
	const format = useDisplayFormatters();
	const display = format.dateParts(time, {
		...(dateFormatOptions ?? {
			dateStyle: preferences.dateStyle === "iso" ? "short" : preferences.dateStyle,
		}),
		timeZone: zone,
	});
	return <div {...props}>{display}</div>;
};
export type RelativeTimeZoneLabelProps = HTMLAttributes<HTMLDivElement>;
export const RelativeTimeZoneLabel = ({
	className,
	...props
}: RelativeTimeZoneLabelProps) => (
	<div
		className={cn(
			"flex h-4 items-center justify-center rounded-xs bg-secondary px-1.5 font-mono",
			className
		)}
		{...props}
	/>
);
