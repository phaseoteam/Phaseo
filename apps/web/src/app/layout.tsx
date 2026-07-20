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
import { ConsoleEasterEgg } from "@/components/ConsoleEasterEgg";
import SiteNoticeSlot from "@/components/site-notice/SiteNoticeSlot";
import ThemeAwareFavicon from "@/components/ThemeAwareFavicon";
import { Suspense } from "react";
import { PublicSWRProvider } from "@/components/providers/PublicSWRProvider";
import AdminDeveloperMenuLauncher from "@/components/developer-menu/AdminDeveloperMenuLauncher";

const montserrat = Montserrat({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: {
		default: PREFERRED_SITE_NAME,
		template: `%s | ${SITE_NAME}`,
	},
	description:
		"Discover and compare the world's most comprehensive AI model database and gateway. Browse benchmarks, features, pricing, and access state-of-the-art AI models.",
	applicationName: PREFERRED_SITE_NAME,
	authors: [{ name: SITE_NAME }],
	metadataBase: METADATA_BASE,
	icons: {
		icon: [{ url: "/api/favicon", type: "image/svg+xml", sizes: "any" }],
		shortcut: [{ url: "/api/favicon", type: "image/svg+xml" }],
	},
	openGraph: {
		type: "website",
		locale: "en_GB",
		siteName: PREFERRED_SITE_NAME,
		url: absoluteUrl("/"),
		title: PREFERRED_SITE_NAME,
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
		title: PREFERRED_SITE_NAME,
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
			{/* <head>
				{process.env.NODE_ENV === "development" ? (
					<script src="https://unpkg.com/react-scan/dist/auto.global.js" />
				) : null}
			</head> */}
			<body
				className={cn(
					montserrat.className,
					"min-h-screen h-full bg-background antialiased"
				)}
			>
				<CookieConsentManager gaMeasurementId={GA_MEASUREMENT_ID} />
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
						<PublicSWRProvider>
							<NuqsAdapter>{children}</NuqsAdapter>
						</PublicSWRProvider>
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

