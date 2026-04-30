"use client";

import {
	Marquee,
	MarqueeContent,
	MarqueeFade,
	MarqueeItem,
} from "@/components/ui/marquee";
import { Logo } from "@/components/Logo";

type PartnerLogosClientProps = {
	logos: string[];
};

export default function PartnerLogosClient({ logos }: PartnerLogosClientProps) {
	return (
		<section className="w-full min-w-0 text-left">
			<div className="relative w-full min-w-0">
				<div className="w-full min-w-0 overflow-hidden rounded border border-dashed px-1 py-2">
					<Marquee className="w-full min-w-0">
						<MarqueeFade side="left" />
						<MarqueeFade side="right" />
						<MarqueeContent pauseOnHover={false} speed={18} style={{ width: "100%" }}>
							{logos.map((logoId) => (
								<MarqueeItem
									key={logoId}
									className="flex items-center justify-center px-3 py-1"
								>
									<Logo
										id={logoId}
										width={36}
										height={36}
										className="opacity-80 transition-all duration-200 ease-out hover:opacity-100"
									/>
								</MarqueeItem>
							))}
						</MarqueeContent>
					</Marquee>
				</div>
			</div>
		</section>
	);
}
