"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ThroughputLiveChartProps {
	className?: string;
}

type LineState = {
	base: number;
	amplitude: number;
	velocity: number;
	wobble: number;
	trend: number;
	points: number[];
};

const COLORS = ["#f59e0b", "#14b8a6", "#3b82f6", "#a855f7"] as const;
const SAMPLE_COUNT = 40;
const SAMPLE_MS = 160;
const VIEWBOX_WIDTH = 180;
const VIEWBOX_HEIGHT = 96;

const INITIAL_LINES = [
	[0.34, 0.338, 0.335, 0.333, 0.332, 0.331, 0.333, 0.336, 0.34, 0.344, 0.348, 0.351, 0.353, 0.352, 0.349, 0.345, 0.341, 0.338, 0.336, 0.335],
	[0.44, 0.438, 0.436, 0.435, 0.437, 0.441, 0.447, 0.454, 0.462, 0.469, 0.474, 0.476, 0.474, 0.469, 0.462, 0.454, 0.447, 0.441, 0.437, 0.434],
	[0.57, 0.568, 0.566, 0.565, 0.566, 0.569, 0.573, 0.578, 0.584, 0.59, 0.595, 0.598, 0.599, 0.597, 0.593, 0.588, 0.582, 0.576, 0.571, 0.567],
	[0.68, 0.679, 0.678, 0.677, 0.678, 0.681, 0.686, 0.693, 0.701, 0.709, 0.716, 0.72, 0.721, 0.718, 0.712, 0.705, 0.697, 0.69, 0.684, 0.68],
] as const;

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function smoothValues(values: number[]) {
	return values.map((value, index) => {
		const previous = values[index - 1] ?? value;
		const beforePrevious = values[index - 2] ?? previous;
		const next = values[index + 1] ?? value;
		const afterNext = values[index + 2] ?? next;
		return beforePrevious * 0.18 + previous * 0.22 + value * 0.2 + next * 0.22 + afterNext * 0.18;
	});
}

function createCanvasPoints(values: number[], width: number, height: number, offsetX: number) {
	const stepX = width / (SAMPLE_COUNT - 1);
	const smoothedValues = smoothValues(values);
	return smoothedValues.map((value, index) => ({
		x: index * stepX + offsetX,
		y: height - value * height,
	}));
}

function buildPathFromPoints(points: Array<{ x: number; y: number }>) {
	let path = `M${points[0]!.x} ${points[0]!.y}`;

	for (let index = 1; index < points.length - 1; index += 1) {
		const current = points[index]!;
		const next = points[index + 1]!;
		const controlX = (current.x + next.x) / 2;
		const controlY = (current.y + next.y) / 2;
		path += ` Q${current.x} ${current.y} ${controlX} ${controlY}`;
	}

	const last = points[points.length - 1]!;
	path += ` L${last.x} ${last.y}`;
	return path;
}

function interpolateValues(values: readonly number[], targetCount: number) {
	if (values.length === 0) return Array.from({ length: targetCount }, () => 0.5);
	if (values.length === targetCount) return [...values];
	if (targetCount === 1) return [values[0]!];

	return Array.from({ length: targetCount }, (_, index) => {
		const position = (index / (targetCount - 1)) * (values.length - 1);
		const lower = Math.floor(position);
		const upper = Math.min(values.length - 1, lower + 1);
		const ratio = position - lower;
		const start = values[lower]!;
		const end = values[upper]!;
		return start + (end - start) * ratio;
	});
}

function createSeededLineState(index: number, seedValues: readonly number[]): LineState {
	const points = interpolateValues(seedValues, SAMPLE_COUNT + 2).map((value) =>
		clamp(value, 0.08, 0.94)
	);
	const min = Math.min(...points);
	const max = Math.max(...points);
	const base = points.reduce((sum, value) => sum + value, 0) / points.length;
	const amplitude = clamp((max - min) * 0.5, 0.03, 0.12);
	const velocity = 0.002 + index * 0.00035;
	const wobble = index * 0.9 + Math.PI / 4;
	const trend = 0;
	return { base, amplitude, velocity, wobble, trend, points };
}

function cloneLineState(line: LineState): LineState {
	return {
		...line,
		points: [...line.points],
	};
}

const INITIAL_LINE_STATES: LineState[] = COLORS.map((_, index) =>
	createSeededLineState(index, INITIAL_LINES[index] ?? INITIAL_LINES[0])
);

const STATIC_PATHS = INITIAL_LINE_STATES.map((line) => {
	const points = createCanvasPoints(line.points, VIEWBOX_WIDTH, VIEWBOX_HEIGHT, 0);
	return buildPathFromPoints(points);
});

function nextPoint(line: LineState) {
	const last = line.points[line.points.length - 1] ?? line.base;
	line.wobble += 0.14 + Math.random() * 0.08;
	line.trend = clamp(line.trend * 0.94 + (Math.random() - 0.5) * 0.002, -0.012, 0.012);
	const sinusoidal = Math.sin(line.wobble) * line.amplitude;
	const slowWave = Math.sin(line.wobble * 0.28 + line.base * 6) * line.amplitude * 0.55;
	const meanReversion = (line.base - last) * 0.12;
	const momentum = Math.sin(line.wobble * 0.42) * line.velocity * 5;
	const next = last + line.trend + meanReversion + sinusoidal * 0.035 + slowWave * 0.028 + momentum;
	return clamp(next, 0.08, 0.94);
}

function drawSmoothLine(
	ctx: CanvasRenderingContext2D,
	values: number[],
	color: string,
	width: number,
	height: number,
	offsetX: number
) {
	const points = createCanvasPoints(values, width, height, offsetX);

	ctx.beginPath();
	ctx.moveTo(points[0].x, points[0].y);

	for (let index = 1; index < points.length - 1; index += 1) {
		const current = points[index];
		const next = points[index + 1];
		const controlX = (current.x + next.x) / 2;
		const controlY = (current.y + next.y) / 2;
		ctx.quadraticCurveTo(current.x, current.y, controlX, controlY);
	}

	const last = points[points.length - 1];
	ctx.lineTo(last.x, last.y);
	ctx.strokeStyle = color;
	ctx.lineWidth = 2;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.stroke();
}

export default function ThroughputLiveChart({ className }: ThroughputLiveChartProps) {
	const [isReady, setIsReady] = useState(false);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const frameRef = useRef<number | null>(null);
	const sizeRef = useRef({ width: VIEWBOX_WIDTH, height: VIEWBOX_HEIGHT });
	const linesRef = useRef<LineState[]>(INITIAL_LINE_STATES.map(cloneLineState));
	const timingRef = useRef({ lastSampleAt: 0 });
	const readyRef = useRef(false);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const context = canvas.getContext("2d");
		if (!context) return;

		const resizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;

			const width = Math.max(1, Math.floor(entry.contentRect.width));
			const height = Math.max(1, Math.floor(entry.contentRect.height));
			const dpr = window.devicePixelRatio || 1;

			sizeRef.current = { width, height };
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
			context.setTransform(dpr, 0, 0, dpr, 0, 0);
		});

		resizeObserver.observe(canvas);

		let mounted = true;
		readyRef.current = false;

		const render = (timestamp: number) => {
			if (!mounted) return;

			if (!timingRef.current.lastSampleAt) {
				timingRef.current.lastSampleAt = timestamp;
			}

			while (timestamp - timingRef.current.lastSampleAt >= SAMPLE_MS) {
				linesRef.current = linesRef.current.map((line) => {
					const updated = { ...line, points: [...line.points] };
					updated.points.shift();
					updated.points.push(nextPoint(updated));
					return updated;
				});
				timingRef.current.lastSampleAt += SAMPLE_MS;
			}

			const { width, height } = sizeRef.current;
			context.clearRect(0, 0, width, height);
			const progress = (timestamp - timingRef.current.lastSampleAt) / SAMPLE_MS;
			const offsetX = -(width / (SAMPLE_COUNT - 1)) * progress;

			linesRef.current.forEach((line, index) => {
				drawSmoothLine(context, line.points, COLORS[index], width, height, offsetX);
			});

			if (!readyRef.current) {
				readyRef.current = true;
				setIsReady(true);
			}

			frameRef.current = window.requestAnimationFrame(render);
		};

		frameRef.current = window.requestAnimationFrame(render);

		return () => {
			mounted = false;
			resizeObserver.disconnect();
			if (frameRef.current !== null) {
				window.cancelAnimationFrame(frameRef.current);
			}
		};
	}, []);

	return (
		<div className={cn("relative mt-2 h-24 w-full", className)} aria-hidden="true">
			<svg
				viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
				className={cn(
					"absolute inset-0 h-full w-full transition-opacity duration-300",
					isReady ? "opacity-0" : "opacity-100"
				)}
				preserveAspectRatio="none"
			>
				{STATIC_PATHS.map((path, index) => (
					<path
						key={COLORS[index]}
						d={path}
						fill="none"
						stroke={COLORS[index]}
						strokeWidth="2"
						strokeLinecap="round"
					/>
				))}
			</svg>
			<canvas
				ref={canvasRef}
				className={cn(
					"absolute inset-0 h-full w-full transition-opacity duration-300",
					isReady ? "opacity-100" : "opacity-0"
				)}
			/>
		</div>
	);
}
