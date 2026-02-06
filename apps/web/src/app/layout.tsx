// app/layout.tsx
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Analytics } from "@vercel/analytics/next";
import { Montserrat } from "next/font/google";
import { cn } from "@/lib/utils";
import { TailwindIndicator } from "@/components/tailwind-indicator";
import { Metadata } from "next";
import { METADATA_BASE } from "@/lib/seo";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";
import { CookieConsentManager } from "@/components/analytics/CookieConsentManager";

const montserrat = Montserrat({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: {
		default: "AI Stats",
		template: "%s | AI Stats",
	},
	description:
		"Discover and compare the world's most comprehensive AI model database and gateway. Browse benchmarks, features, pricing, and access state-of-the-art AI models.",
	authors: [{ name: "AI Stats" }],
	metadataBase: METADATA_BASE,
	openGraph: {
		type: "website",
		locale: "en_GB",
		siteName: "AI Stats",
		url: "https://ai-stats.phaseo.app",
		title: "AI Stats",
		description:
			"Browse and compare state-of-the-art AI models, benchmarks, features, and pricing.",
		images: [
			{
				url: "https://ai-stats.phaseo.app/og.png",
				width: 1200,
				height: 630,
				alt: "AI Stats - Browse and compare AI models",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		site: "@phaseoapp",
		creator: "@DanielButler001",
		title: "AI Stats",
		description:
			"Browse and compare state-of-the-art AI models, benchmarks, features, and pricing.",
		images: ["https://ai-stats.phaseo.app/og.png"],
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
				<ThemeProvider
					attribute="class"
					defaultTheme="light"
					enableSystem={false}
					disableTransitionOnChange
				>
					<TooltipProvider>
						<NuqsAdapter>{children}</NuqsAdapter>
						<TailwindIndicator />
					</TooltipProvider>
				</ThemeProvider>
				<Toaster richColors />
				<Analytics />
			</body>
		</html>
	);
}
