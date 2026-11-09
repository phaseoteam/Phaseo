import Image from "@/components/image";
import Link from "@/components/link";
import { useTranslations } from "@/i18n/react";

export function AuthWordmark() {
	const t = useTranslations("Auth.brand");

	return (
		<Link
			href="/"
			aria-label={t("homeLabel")}
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
