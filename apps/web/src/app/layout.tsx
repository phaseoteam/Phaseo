// app/layout.tsx
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { CatalogNavigationGuardProvider } from "@/components/(data)/UnsavedChangesGuard";
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
import { WebQueryProvider } from "@/components/providers/WebQueryProvider";
import AdminDeveloperMenuLauncher from "@/components/developer-menu/AdminDeveloperMenuLauncher";
import { HISTORY_PRIVACY_SCRIPT } from "@/lib/query/historyPrivacyScript";
import { DisplayPreferencesProvider } from "@/components/providers/DisplayPreferencesProvider";

const montserrat = Montserrat({ subsets: ["latin"] });

const APPEARANCE_INITIALIZATION_SCRIPT = `(()=>{try{const p=JSON.parse(localStorage.getItem("phaseo-display-preferences-v1")||"null");if(!p||typeof p!=="object")return;const r=document.documentElement;const lp=["phaseo","paper","warm"],dp=["phaseo","slate","midnight"],hex=/^#[0-9a-f]{6}$/i;const fg=v=>{const c=[1,3,5].map(i=>parseInt(v.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4)),l=.2126*c[0]+.7152*c[1]+.0722*c[2];return 1.05/(l+.05)>=(l+.05)/.052?"#ffffff":"#0b0b0b"};if(lp.includes(p.lightPalette))r.dataset.lightPalette=p.lightPalette;if(dp.includes(p.darkPalette))r.dataset.darkPalette=p.darkPalette;if(["comfortable","compact"].includes(p.density))r.dataset.density=p.density;if(typeof p.maskSensitiveData==="boolean")r.dataset.obfuscatePii=p.maskSensitiveData?"true":"false";if(hex.test(p.lightAccent)){r.style.setProperty("--light-user-accent",p.lightAccent);r.style.setProperty("--light-user-accent-foreground",fg(p.lightAccent))}if(hex.test(p.darkAccent)){r.style.setProperty("--dark-user-accent",p.darkAccent);r.style.setProperty("--dark-user-accent-foreground",fg(p.darkAccent))}}catch{}})();`;

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
				<script id="history-privacy" dangerouslySetInnerHTML={{ __html: HISTORY_PRIVACY_SCRIPT }} />
				<script dangerouslySetInnerHTML={{ __html: APPEARANCE_INITIALIZATION_SCRIPT }} />
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
				<CookieConsentManager gaMeasurementId={GA_MEASUREMENT_ID} />
				<ProductAnalyticsGaBridge />
				<ConsoleEasterEgg />
				<CatalogNavigationGuardProvider><ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<DisplayPreferencesProvider>
					<TooltipProvider>
						<ThemeAwareFavicon />
						<Suspense fallback={null}>
							<SiteNoticeSlot />
						</Suspense>
						<Suspense fallback={null}>
							<WebQueryProvider>
								<NuqsAdapter>{children}</NuqsAdapter>
							</WebQueryProvider>
						</Suspense>
						<AdminDeveloperMenuLauncher />
						<TailwindIndicator />
						<Toaster richColors />
					</TooltipProvider>
					</DisplayPreferencesProvider>
				</ThemeProvider></CatalogNavigationGuardProvider>
				<DeferredVercelAnalytics />
			</body>
		</html>
	);
}
