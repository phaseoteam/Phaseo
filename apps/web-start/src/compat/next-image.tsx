// `next/image` as a plain <img> with the same props. Images are served as-is
// (no optimiser), matching how the vinext preview behaved.
import { forwardRef, type CSSProperties, type ImgHTMLAttributes } from "react";

type StaticImport = { src: string; width?: number; height?: number; blurDataURL?: string } | { default: { src: string; width?: number; height?: number } };

export type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height" | "loading"> & {
	src: string | StaticImport;
	alt: string;
	width?: number | `${number}`;
	height?: number | `${number}`;
	fill?: boolean;
	sizes?: string;
	quality?: number | `${number}`;
	priority?: boolean;
	preload?: boolean;
	loading?: "eager" | "lazy";
	placeholder?: string;
	blurDataURL?: string;
	unoptimized?: boolean;
	overrideSrc?: string;
	loader?: (args: { src: string; width: number; quality?: number }) => string;
	onLoadingComplete?: (img: HTMLImageElement) => void;
};

function resolveSrc(src: ImageProps["src"]): { src: string; width?: number; height?: number } {
	if (typeof src === "string") return { src };
	if ("default" in src) return src.default;
	return src;
}

const Image = forwardRef<HTMLImageElement, ImageProps>(function Image(
	{ src, width, height, fill, sizes, quality: _quality, priority, preload, loading, placeholder: _placeholder, blurDataURL: _blur, unoptimized: _unoptimized, overrideSrc, loader, onLoadingComplete, style, onLoad, ...rest },
	ref,
) {
	const resolved = resolveSrc(src);
	const w = width !== undefined ? Number(width) : fill ? undefined : resolved.width;
	const h = height !== undefined ? Number(height) : fill ? undefined : resolved.height;
	const finalSrc = overrideSrc ?? (loader ? loader({ src: resolved.src, width: w ?? 0 }) : resolved.src);
	const fillStyle: CSSProperties | undefined = fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined;
	const eager = priority || preload;
	return (
		<img
			ref={ref}
			src={finalSrc}
			width={w}
			height={h}
			sizes={sizes}
			loading={loading ?? (eager ? "eager" : "lazy")}
			fetchPriority={eager ? "high" : undefined}
			decoding="async"
			style={fillStyle ? { ...fillStyle, ...style } : style}
			onLoad={(event) => {
				onLoad?.(event);
				onLoadingComplete?.(event.currentTarget);
			}}
			{...rest}
		/>
	);
});

export default Image;
export function getImageProps(props: ImageProps) {
	const resolved = resolveSrc(props.src);
	return { props: { src: resolved.src, width: props.width, height: props.height, alt: props.alt } };
}
