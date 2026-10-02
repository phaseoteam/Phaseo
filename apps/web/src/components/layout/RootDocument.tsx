import { Suspense, type ReactNode } from "react";
import {
	Montserrat,
	Noto_Sans_Arabic,
	Noto_Sans_Devanagari,
	Noto_Sans_JP,
	Noto_Sans_SC,
} from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { LocaleMessagesProvider } from "@/components/i18n/LocaleMessagesProvider";
import {
	CookieConsentManager,
	type CookieConsentCopy,
} from "@/components/analytics/CookieConsentManager";
import { DeferredVercelAnalytics } from "@/components/analytics/DeferredVercelAnalytics";
import { ProductAnalyticsGaBridge } from "@/components/analytics/ProductAnalyticsGaBridge";
import { ConsoleEasterEgg } from "@/components/ConsoleEasterEgg";
import AdminDeveloperMenuLauncher from "@/components/developer-menu/AdminDeveloperMenuLauncher";
import { WebQueryProvider } from "@/components/providers/WebQueryProvider";
import { DisplayPreferencesProvider } from "@/components/providers/DisplayPreferencesProvider";
import { CatalogNavigationGuardProvider } from "@/components/(data)/UnsavedChangesGuard";
import { HISTORY_PRIVACY_SCRIPT } from "@/lib/query/historyPrivacyScript";
import SiteNoticeSlot from "@/components/site-notice/SiteNoticeSlot";
import { TailwindIndicator } from "@/components/tailwind-indicator";
import { ThemeProvider } from "@/components/theme-provider";
import ThemeAwareFavicon from "@/components/ThemeAwareFavicon";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { FontProfile, LocaleDirection, RuntimeLocale } from "@/i18n/routing";
import { englishMessages, type SourceMessages } from "@/i18n/default-messages";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const APPEARANCE_INITIALIZATION_SCRIPT = `(()=>{try{const p=JSON.parse(localStorage.getItem("phaseo-display-preferences-v1")||"null");if(!p||typeof p!=="object")return;const r=document.documentElement;const lp=["phaseo","paper","warm"],dp=["phaseo","slate","midnight"],hex=/^#[0-9a-f]{6}$/i;const fg=v=>{const c=[1,3,5].map(i=>parseInt(v.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4)),l=.2126*c[0]+.7152*c[1]+.0722*c[2];return 1.05/(l+.05)>=(l+.05)/.052?"#ffffff":"#0b0b0b"};if(lp.includes(p.lightPalette))r.dataset.lightPalette=p.lightPalette;if(dp.includes(p.darkPalette))r.dataset.darkPalette=p.darkPalette;if(["comfortable","compact"].includes(p.density))r.dataset.density=p.density;if(typeof p.maskSensitiveData==="boolean")r.dataset.obfuscatePii=p.maskSensitiveData?"true":"false";if(hex.test(p.lightAccent)){r.style.setProperty("--light-user-accent",p.lightAccent);r.style.setProperty("--light-user-accent-foreground",fg(p.lightAccent))}if(hex.test(p.darkAccent)){r.style.setProperty("--dark-user-accent",p.darkAccent);r.style.setProperty("--dark-user-accent-foreground",fg(p.darkAccent))}}catch{}})();`;

const montserrat = Montserrat({
	display: "swap",
	subsets: ["latin", "latin-ext"],
	variable: "--font-montserrat",
});

// Script-specific families are exposed as variables and only selected by the
// locale that needs them. Disabling preload avoids downloading every writing
// system on an English request.
const notoSansArabic = Noto_Sans_Arabic({
	display: "swap",
	preload: false,
	subsets: ["arabic"],
	variable: "--font-noto-sans-arabic",
});
const notoSansDevanagari = Noto_Sans_Devanagari({
	display: "swap",
	preload: false,
	subsets: ["devanagari"],
	variable: "--font-noto-sans-devanagari",
});
const notoSansJapanese = Noto_Sans_JP({
	display: "swap",
	preload: false,
	variable: "--font-noto-sans-japanese",
});
const notoSansSimplifiedChinese = Noto_Sans_SC({
	display: "swap",
	preload: false,
	variable: "--font-noto-sans-simplified-chinese",
});

const fontVariables = cn(
	montserrat.variable,
	notoSansArabic.variable,
	notoSansDevanagari.variable,
	notoSansJapanese.variable,
	notoSansSimplifiedChinese.variable,
);

export type RootDocumentProps = {
	children: ReactNode;
	cookieConsentCopy: CookieConsentCopy;
	direction: LocaleDirection;
	fontProfile: FontProfile;
	locale: RuntimeLocale;
	messages?: SourceMessages;
};

/**
 * The complete document shell shared by Phaseo's independent root layouts.
 * Keeping the document in one component lets the localized and existing route
 * trees use identical providers while still emitting request-correct html
 * language, direction and script font attributes on the server.
 */
export function RootDocument({
	children,
	cookieConsentCopy,
	direction,
	fontProfile,
	locale,
	messages = englishMessages,
}: RootDocumentProps) {
	return (
		<html
			lang={locale}
			dir={direction}
			data-font={fontProfile}
			className={cn(fontVariables, "h-full")}
			suppressHydrationWarning
		>
			{/* eslint-disable-next-line @next/next/no-head-element -- App Router root document owns this stable, theme-mutated favicon node. */}
			<head>
				<script id="history-privacy" dangerouslySetInnerHTML={{ __html: HISTORY_PRIVACY_SCRIPT }} />
				<script dangerouslySetInnerHTML={{ __html: APPEARANCE_INITIALIZATION_SCRIPT }} />
				{/* The theme client mutates this exact link as the colour scheme changes. */}
				<link
					id="phaseo-favicon"
					rel="icon"
					href="/api/favicon?theme=dark"
					type="image/svg+xml"
					sizes="any"
				/>
			</head>
			<body className="min-h-screen h-full bg-background antialiased">
				<LocaleMessagesProvider locale={locale} messages={messages} timeZone="UTC">
				<CookieConsentManager
					copy={cookieConsentCopy}
					gaMeasurementId={GA_MEASUREMENT_ID}
				/>
				<ProductAnalyticsGaBridge />
				<ConsoleEasterEgg />
				<CatalogNavigationGuardProvider>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<DisplayPreferencesProvider locale={locale}>
					<TooltipProvider>
						<ThemeAwareFavicon />
						<Suspense fallback={null}>
							<SiteNoticeSlot />
						</Suspense>
						<Suspense fallback={null}>
							<WebQueryProvider>
							<NuqsAdapter>
								{children}
							</NuqsAdapter>
							</WebQueryProvider>
						</Suspense>
						<AdminDeveloperMenuLauncher />
						<TailwindIndicator />
						<Toaster richColors />
					</TooltipProvider>
					</DisplayPreferencesProvider>
				</ThemeProvider>
				</CatalogNavigationGuardProvider>
				<DeferredVercelAnalytics />
				</LocaleMessagesProvider>
			</body>
		</html>
	);
}
