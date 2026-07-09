import Image from "next/image";
import Link from "next/link";

export function AuthWordmark() {
	return (
		<Link
			href="/"
			aria-label="Phaseo home"
			className="inline-flex items-center transition-opacity hover:opacity-80"
		>
			<Image
				src="/wordmark_light.svg"
				alt="Phaseo"
				width={154}
				height={40}
				className="h-8 w-auto select-none dark:hidden"
				style={{ width: "auto" }}
				priority
			/>
			<Image
				src="/wordmark_dark.svg"
				alt="Phaseo"
				width={154}
				height={40}
				className="hidden h-8 w-auto select-none dark:block"
				style={{ width: "auto" }}
				priority
			/>
		</Link>
	);
}
