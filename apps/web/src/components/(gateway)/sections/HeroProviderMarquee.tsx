import { useTranslations } from "next-intl";
import { Logo } from "@/components/Logo";
import {
	Marquee,
	MarqueeContent,
	MarqueeFade,
	MarqueeItem,
} from "@/components/ui/marquee";

interface HeroProviderMarqueeProps {
	logos: string[];
}

export function HeroProviderMarquee({ logos }: HeroProviderMarqueeProps) {
	const tCopy = useTranslations("Site.landingGaps");

	if (!logos.length) {
		return (
			<div className="rounded-2xl border border-slate-200 px-5 py-6 text-center text-sm text-slate-500 dark:text-slate-300">
{tCopy("copy001")}
</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-2xl border border-slate-200 px-0 py-1 shadow-sm">
			<Marquee>
				<MarqueeFade side="left" />
				<MarqueeFade side="right" />
				<MarqueeContent pauseOnHover={false} speed={18}>
					{logos.map((logoId) => (
						<MarqueeItem
							key={logoId}
							className="flex items-center justify-center px-3 py-1"
						>
							<Logo
								id={logoId}
								width={32}
								height={32}
								className="opacity-70 transition-all duration-150 hover:opacity-100"
							/>
						</MarqueeItem>
					))}
				</MarqueeContent>
			</Marquee>
		</div>
	);
}
