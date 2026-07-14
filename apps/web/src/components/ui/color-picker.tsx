"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type RgbColor = {
	r: number;
	g: number;
	b: number;
};

type HsvColor = {
	h: number;
	s: number;
	v: number;
};

type HslColor = {
	h: number;
	s: number;
	l: number;
};

type OklchColor = {
	l: number;
	c: number;
	h: number;
};

type ColorFormat = "hex" | "rgb" | "hsl" | "oklch";

type ColorPickerProps = {
	value: string;
	onChange: (value: string) => void;
	className?: string;
};

const COLOR_FORMATS: Array<{ label: string; value: ColorFormat }> = [
	{ label: "Hex", value: "hex" },
	{ label: "RGB", value: "rgb" },
	{ label: "HSL", value: "hsl" },
	{ label: "OKLCH", value: "oklch" },
];

const FALLBACK_COLOR = "#2563eb";
const FALLBACK_RGB = { r: 37, g: 99, b: 235 };

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function componentToHex(value: number) {
	return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function rgbToHex({ r, g, b }: RgbColor) {
	return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function hexToRgb(value: string): RgbColor | null {
	const normalizedValue = value.trim().replace(/^#/, "");

	if (!/^[0-9a-fA-F]{6}$/.test(normalizedValue)) {
		return null;
	}

	return {
		r: Number.parseInt(normalizedValue.slice(0, 2), 16),
		g: Number.parseInt(normalizedValue.slice(2, 4), 16),
		b: Number.parseInt(normalizedValue.slice(4, 6), 16),
	};
}

function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
	const normalizedR = r / 255;
	const normalizedG = g / 255;
	const normalizedB = b / 255;
	const max = Math.max(normalizedR, normalizedG, normalizedB);
	const min = Math.min(normalizedR, normalizedG, normalizedB);
	const delta = max - min;
	let h = 0;

	if (delta !== 0) {
		if (max === normalizedR) {
			h = 60 * (((normalizedG - normalizedB) / delta) % 6);
		} else if (max === normalizedG) {
			h = 60 * ((normalizedB - normalizedR) / delta + 2);
		} else {
			h = 60 * ((normalizedR - normalizedG) / delta + 4);
		}
	}

	if (h < 0) {
		h += 360;
	}

	return {
		h,
		s: max === 0 ? 0 : delta / max,
		v: max,
	};
}

function hsvToRgb({ h, s, v }: HsvColor): RgbColor {
	const chroma = v * s;
	const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = v - chroma;
	let normalizedR = 0;
	let normalizedG = 0;
	let normalizedB = 0;

	if (h < 60) {
		normalizedR = chroma;
		normalizedG = x;
	} else if (h < 120) {
		normalizedR = x;
		normalizedG = chroma;
	} else if (h < 180) {
		normalizedG = chroma;
		normalizedB = x;
	} else if (h < 240) {
		normalizedG = x;
		normalizedB = chroma;
	} else if (h < 300) {
		normalizedR = x;
		normalizedB = chroma;
	} else {
		normalizedR = chroma;
		normalizedB = x;
	}

	return {
		r: (normalizedR + m) * 255,
		g: (normalizedG + m) * 255,
		b: (normalizedB + m) * 255,
	};
}

function rgbToHsl({ r, g, b }: RgbColor): HslColor {
	const normalizedR = r / 255;
	const normalizedG = g / 255;
	const normalizedB = b / 255;
	const max = Math.max(normalizedR, normalizedG, normalizedB);
	const min = Math.min(normalizedR, normalizedG, normalizedB);
	const delta = max - min;
	let h = 0;
	const l = (max + min) / 2;

	if (delta !== 0) {
		if (max === normalizedR) {
			h = 60 * (((normalizedG - normalizedB) / delta) % 6);
		} else if (max === normalizedG) {
			h = 60 * ((normalizedB - normalizedR) / delta + 2);
		} else {
			h = 60 * ((normalizedR - normalizedG) / delta + 4);
		}
	}

	if (h < 0) {
		h += 360;
	}

	return {
		h,
		s: delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1)),
		l,
	};
}

function hslToRgb({ h, s, l }: HslColor): RgbColor {
	const chroma = (1 - Math.abs(2 * l - 1)) * s;
	const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - chroma / 2;
	let normalizedR = 0;
	let normalizedG = 0;
	let normalizedB = 0;

	if (h < 60) {
		normalizedR = chroma;
		normalizedG = x;
	} else if (h < 120) {
		normalizedR = x;
		normalizedG = chroma;
	} else if (h < 180) {
		normalizedG = chroma;
		normalizedB = x;
	} else if (h < 240) {
		normalizedG = x;
		normalizedB = chroma;
	} else if (h < 300) {
		normalizedR = x;
		normalizedB = chroma;
	} else {
		normalizedR = chroma;
		normalizedB = x;
	}

	return {
		r: (normalizedR + m) * 255,
		g: (normalizedG + m) * 255,
		b: (normalizedB + m) * 255,
	};
}

function srgbToLinear(value: number) {
	const normalizedValue = value / 255;
	return normalizedValue <= 0.04045
		? normalizedValue / 12.92
		: ((normalizedValue + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number) {
	const normalizedValue =
		value <= 0.0031308
			? 12.92 * value
			: 1.055 * value ** (1 / 2.4) - 0.055;

	return clamp(normalizedValue * 255, 0, 255);
}

function rgbToOklch({ r, g, b }: RgbColor): OklchColor {
	const linearR = srgbToLinear(r);
	const linearG = srgbToLinear(g);
	const linearB = srgbToLinear(b);
	const l =
		0.4122214708 * linearR +
		0.5363325363 * linearG +
		0.0514459929 * linearB;
	const m =
		0.2119034982 * linearR +
		0.6806995451 * linearG +
		0.1073969566 * linearB;
	const s =
		0.0883024619 * linearR +
		0.2817188376 * linearG +
		0.6299787005 * linearB;
	const lRoot = Math.cbrt(l);
	const mRoot = Math.cbrt(m);
	const sRoot = Math.cbrt(s);
	const oklabL =
		0.2104542553 * lRoot +
		0.793617785 * mRoot -
		0.0040720468 * sRoot;
	const oklabA =
		1.9779984951 * lRoot -
		2.428592205 * mRoot +
		0.4505937099 * sRoot;
	const oklabB =
		0.0259040371 * lRoot +
		0.7827717662 * mRoot -
		0.808675766 * sRoot;
	const chroma = Math.sqrt(oklabA ** 2 + oklabB ** 2);
	const hue = (Math.atan2(oklabB, oklabA) * 180) / Math.PI;

	return {
		l: oklabL,
		c: chroma,
		h: hue < 0 ? hue + 360 : hue,
	};
}

function oklchToRgb({ l, c, h }: OklchColor): RgbColor {
	const hueRadians = (h * Math.PI) / 180;
	const oklabA = c * Math.cos(hueRadians);
	const oklabB = c * Math.sin(hueRadians);
	const lRoot = l + 0.3963377774 * oklabA + 0.2158037573 * oklabB;
	const mRoot = l - 0.1055613458 * oklabA - 0.0638541728 * oklabB;
	const sRoot = l - 0.0894841775 * oklabA - 1.291485548 * oklabB;
	const lLinear = lRoot ** 3;
	const mLinear = mRoot ** 3;
	const sLinear = sRoot ** 3;

	return {
		r: linearToSrgb(
			4.0767416621 * lLinear -
				3.3077115913 * mLinear +
				0.2309699292 * sLinear,
		),
		g: linearToSrgb(
			-1.2684380046 * lLinear +
				2.6097574011 * mLinear -
				0.3413193965 * sLinear,
		),
		b: linearToSrgb(
			-0.0041960863 * lLinear -
				0.7034186147 * mLinear +
				1.707614701 * sLinear,
		),
	};
}

function formatDecimal(value: number, digits = 2) {
	return Number.parseFloat(value.toFixed(digits)).toString();
}

function normalizeColorValue(value: string) {
	const rgb = hexToRgb(value);

	return rgb ? rgbToHex(rgb) : FALLBACK_COLOR;
}

function getColorFromPointer(
	event: React.PointerEvent<HTMLDivElement>,
	map: (x: number, y: number) => number,
) {
	const rect = event.currentTarget.getBoundingClientRect();
	const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
	const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);

	return map(x, y);
}

function ColorPicker({ value, onChange, className }: ColorPickerProps) {
	const [currentHex, setCurrentHex] = React.useState(() =>
		normalizeColorValue(value),
	);
	const currentHexRef = React.useRef(currentHex);
	const rgb = hexToRgb(currentHex) ?? FALLBACK_RGB;
	const hsv = rgbToHsv(rgb);
	const hsl = rgbToHsl(rgb);
	const oklch = rgbToOklch(rgb);
	const hexValue = rgbToHex(hsvToRgb(hsv));
	const hueColor = `hsl(${hsv.h} 100% 50%)`;
	const [colorFormat, setColorFormat] =
		React.useState<ColorFormat>("hex");
	const [hexDraft, setHexDraft] = React.useState(hexValue);

	React.useEffect(() => {
		setHexDraft(hexValue);
	}, [hexValue]);

	React.useEffect(() => {
		const normalizedValue = normalizeColorValue(value);

		currentHexRef.current = normalizedValue;
		setCurrentHex(normalizedValue);
	}, [value]);

	const updateLocalColor = React.useCallback((nextHex: string) => {
		currentHexRef.current = nextHex;
		setCurrentHex(nextHex);
	}, []);

	const commitColor = React.useCallback(
		(nextHex = currentHexRef.current) => {
			currentHexRef.current = nextHex;
			setCurrentHex(nextHex);
			onChange(nextHex);
		},
		[onChange],
	);

	const commitHsv = (nextHsv: HsvColor, save = false) => {
		const nextHex = rgbToHex(hsvToRgb(nextHsv));

		if (save) {
			commitColor(nextHex);
			return;
		}

		updateLocalColor(nextHex);
	};

	const commitRgbComponent = (component: keyof RgbColor, value: string) => {
		const numericValue = Number.parseInt(value, 10);

		if (Number.isNaN(numericValue)) {
			return;
		}

		commitColor(
			rgbToHex({
				...rgb,
				[component]: clamp(numericValue, 0, 255),
			}),
		);
	};

	const commitHslComponent = (component: keyof HslColor, value: string) => {
		const numericValue = Number.parseFloat(value);

		if (Number.isNaN(numericValue)) {
			return;
		}

		commitColor(
			rgbToHex(
				hslToRgb({
					...hsl,
					[component]:
						component === "h"
							? clamp(numericValue, 0, 360)
							: clamp(numericValue, 0, 100) / 100,
				}),
			),
		);
	};

	const commitOklchComponent = (
		component: keyof OklchColor,
		value: string,
	) => {
		const numericValue = Number.parseFloat(value);

		if (Number.isNaN(numericValue)) {
			return;
		}

		commitColor(
			rgbToHex(
				oklchToRgb({
					...oklch,
					[component]:
						component === "l"
							? clamp(numericValue, 0, 100) / 100
							: component === "c"
								? clamp(numericValue, 0, 0.4)
								: clamp(numericValue, 0, 360),
				}),
			),
		);
	};

	const handleSaturationValuePointer = (
		event: React.PointerEvent<HTMLDivElement>,
	) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		commitHsv({
			...hsv,
			s: getColorFromPointer(event, (x) => x),
			v: getColorFromPointer(event, (_, y) => 1 - y),
		});
	};

	const handleHuePointer = (event: React.PointerEvent<HTMLDivElement>) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		commitHsv({
			...hsv,
			h: getColorFromPointer(event, (x) => x * 360),
		});
	};

	return (
		<div className={cn("grid gap-3", className)}>
			<div
				role="slider"
				aria-label="Saturation and brightness"
				aria-valuetext={`${Math.round(hsv.s * 100)}% saturation, ${Math.round(
					hsv.v * 100,
				)}% brightness`}
				tabIndex={0}
				className="relative h-36 cursor-crosshair overflow-hidden rounded-xl border border-border shadow-inner outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
				style={{ backgroundColor: hueColor }}
				onPointerDown={handleSaturationValuePointer}
				onPointerMove={(event) => {
					if (event.buttons === 1) {
						handleSaturationValuePointer(event);
					}
				}}
				onPointerUp={() => commitColor()}
				onPointerCancel={() => commitColor()}
			>
				<div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
				<div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
				<span
					className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.35)]"
					style={{
						left: `${hsv.s * 100}%`,
						top: `${(1 - hsv.v) * 100}%`,
					}}
				/>
			</div>
			<div className="flex items-center gap-2">
				<div
					role="slider"
					aria-label="Hue"
					aria-valuemin={0}
					aria-valuemax={360}
					aria-valuenow={Math.round(hsv.h)}
					tabIndex={0}
					className="relative h-4 flex-1 cursor-ew-resize rounded-full border border-border outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
					style={{
						background:
							"linear-gradient(90deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)",
					}}
					onPointerDown={handleHuePointer}
					onPointerMove={(event) => {
						if (event.buttons === 1) {
							handleHuePointer(event);
						}
					}}
					onPointerUp={() => commitColor()}
					onPointerCancel={() => commitColor()}
				>
					<span
						className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.35)]"
						style={{
							left: `${(hsv.h / 360) * 100}%`,
							backgroundColor: hueColor,
						}}
					/>
				</div>
			</div>
			<div
				role="group"
				aria-label="Color value format"
				className="grid grid-cols-4 gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
			>
				{COLOR_FORMATS.map((format) => (
					<Button
						key={format.value}
						type="button"
						variant="ghost"
						size="xs"
						data-state={
							colorFormat === format.value ? "on" : "off"
						}
						onClick={() => setColorFormat(format.value)}
						className="h-7 rounded-[5px] px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[state=on]:hover:bg-background"
						aria-pressed={colorFormat === format.value}
					>
						{format.label}
					</Button>
				))}
			</div>
			{colorFormat === "hex" ? (
				<div className="flex items-center gap-2">
					<div
						aria-hidden="true"
						className="h-8 w-10 shrink-0 rounded-md border border-border"
						style={{ backgroundColor: hexValue }}
					/>
					<Input
						aria-label="Selected color hex value"
						value={hexDraft}
						onChange={(event) => {
							const nextValue = event.target.value.trim();
							setHexDraft(nextValue);
						const nextRgb = hexToRgb(nextValue);

						if (nextRgb) {
							commitColor(rgbToHex(nextRgb));
						}
					}}
						onBlur={() => {
							setHexDraft(hexValue);
						}}
						className="font-mono text-xs"
					/>
				</div>
			) : null}
			{colorFormat === "rgb" ? (
				<div className="grid grid-cols-3 gap-2">
					{(["r", "g", "b"] as const).map((component) => (
						<div key={component} className="grid gap-1">
							<Label
								htmlFor={`color-picker-rgb-${component}`}
								className="text-center text-[10px] uppercase text-muted-foreground"
							>
								{component}
							</Label>
							<Input
								id={`color-picker-rgb-${component}`}
								type="number"
								min={0}
								max={255}
								value={Math.round(rgb[component])}
								onChange={(event) =>
									commitRgbComponent(component, event.target.value)
								}
								className="h-8 text-center font-mono text-xs"
							/>
						</div>
					))}
				</div>
			) : null}
			{colorFormat === "hsl" ? (
				<div className="grid grid-cols-3 gap-2">
					{(["h", "s", "l"] as const).map((component) => (
						<div key={component} className="grid gap-1">
							<Label
								htmlFor={`color-picker-hsl-${component}`}
								className="text-center text-[10px] uppercase text-muted-foreground"
							>
								{component}
							</Label>
							<Input
								id={`color-picker-hsl-${component}`}
								type="number"
								min={0}
								max={component === "h" ? 360 : 100}
								value={
									component === "h"
										? Math.round(hsl.h)
										: Math.round(hsl[component] * 100)
								}
								onChange={(event) =>
									commitHslComponent(component, event.target.value)
								}
								className="h-8 text-center font-mono text-xs"
							/>
						</div>
					))}
				</div>
			) : null}
			{colorFormat === "oklch" ? (
				<div className="grid grid-cols-3 gap-2">
					{(["l", "c", "h"] as const).map((component) => (
						<div key={component} className="grid gap-1">
							<Label
								htmlFor={`color-picker-oklch-${component}`}
								className="text-center text-[10px] uppercase text-muted-foreground"
							>
								{component}
							</Label>
							<Input
								id={`color-picker-oklch-${component}`}
								type="number"
								min={0}
								max={
									component === "l"
										? 100
										: component === "c"
											? 0.4
											: 360
								}
								step={component === "c" ? 0.01 : 1}
								value={
									component === "l"
										? Math.round(oklch.l * 100)
										: component === "c"
											? formatDecimal(oklch.c, 3)
											: Math.round(oklch.h)
								}
								onChange={(event) =>
									commitOklchComponent(
										component,
										event.target.value,
									)
								}
								className="h-8 text-center font-mono text-xs"
							/>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

export { ColorPicker };
