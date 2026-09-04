// app/layout.tsx
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Montserrat } from "next/font/google";
import { cn } from "@/lib/utils";
import { TailwindIndicator } from "@/components/tailwind-indicator";
import { Metadata } from "next";
import {
	METADATA_BASE,
	PREFERRED_SITE_NAME,
	SITE_NAME,
	absoluteUrl,
} from "@/lib/seo";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";
import { CookieConsentManager } from "@/components/analytics/CookieConsentManager";
import { DeferredVercelAnalytics } from "@/components/analytics/DeferredVercelAnalytics";
import { ProductAnalyticsGaBridge } from "@/components/analytics/ProductAnalyticsGaBridge";
import { ConsoleEasterEgg } from "@/components/ConsoleEasterEgg";
import SiteNoticeSlot from "@/components/site-notice/SiteNoticeSlot";
import ThemeAwareFavicon from "@/components/ThemeAwareFavicon";
import { Suspense } from "react";
import { PublicSWRProvider } from "@/components/providers/PublicSWRProvider";
import AdminDeveloperMenuLauncher from "@/components/developer-menu/AdminDeveloperMenuLauncher";
import WebMCPProvider from "@/components/webmcp/WebMCPProvider";

const montserrat = Montserrat({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: {
		default: "Phaseo: The AI Gateway for Every Model and Provider",
		template: `%s | ${SITE_NAME}`,
	},
	description:
		"Discover and compare the world's most comprehensive AI model database and gateway. Browse benchmarks, features, pricing, and access state-of-the-art AI models.",
	applicationName: PREFERRED_SITE_NAME,
	authors: [{ name: SITE_NAME }],
	other: {
		"google-adsense-account": "ca-pub-5904826500425921",
	},
	metadataBase: METADATA_BASE,
	openGraph: {
		type: "website",
		locale: "en_GB",
		siteName: PREFERRED_SITE_NAME,
		url: absoluteUrl("/"),
		title: "Phaseo: The AI Gateway for Every Model and Provider",
		description:
			"Browse and compare state-of-the-art AI models, benchmarks, features, and pricing.",
		images: [
			{
				url: absoluteUrl("/og.png"),
				width: 1200,
				height: 630,
				alt: "Phaseo - Browse and compare AI models",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		site: "@phaseoteam",
		creator: "@DanielButler001",
		title: "Phaseo: The AI Gateway for Every Model and Provider",
		description:
			"Browse and compare state-of-the-art AI models, benchmarks, features, and pricing.",
		images: [absoluteUrl("/og.png")],
	},
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" className="h-full" suppressHydrationWarning>
			<head>
				{/* Use the black/white brand mark for search; the theme client mutates this exact link. */}
				<link
					id="phaseo-favicon"
					rel="icon"
					href="/api/favicon?theme=dark"
					type="image/svg+xml"
					sizes="any"
				/>
			</head>
			<body
				className={cn(
					montserrat.className,
					"min-h-screen h-full bg-background antialiased"
				)}
			>
				<WebMCPProvider />
				<CookieConsentManager gaMeasurementId={GA_MEASUREMENT_ID} />
				<ProductAnalyticsGaBridge />
				<ConsoleEasterEgg />
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<TooltipProvider>
						<ThemeAwareFavicon />
						<Suspense fallback={null}>
							<SiteNoticeSlot />
						</Suspense>
						<Suspense fallback={null}>
							<PublicSWRProvider>
								<NuqsAdapter>{children}</NuqsAdapter>
							</PublicSWRProvider>
						</Suspense>
						<AdminDeveloperMenuLauncher />
						<TailwindIndicator />
						<Toaster richColors />
					</TooltipProvider>
				</ThemeProvider>
				<DeferredVercelAnalytics />
			</body>
		</html>
	);
}
