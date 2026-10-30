import { cn } from "@/lib/utils";
import NextImage from "next/image";
import type { Experimental_GeneratedImage } from "ai";

export type ImageProps = Experimental_GeneratedImage & {
  className?: string;
  alt?: string;
  width?: number;
  height?: number;
};

export const Image = ({
  base64,
  uint8Array,
  mediaType,
  width,
  height,
  alt = "",
  ...props
}: ImageProps) => (
  <NextImage
    width={width ?? 1024}
    height={height ?? 1024}
    unoptimized
    alt={alt}
    {...props}
    className={cn(
      "h-auto max-w-full overflow-hidden rounded-md",
      props.className
    )}
    src={`data:${mediaType};base64,${base64}`}
  />
);
