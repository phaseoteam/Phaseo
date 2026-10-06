import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowRight, GitBranch, Layers, Monitor, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { PublicLocale } from "@/i18n/routing";
import { buildMetadata } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export async function generateMetadata({ params }: { params: Promise<{ locale: PublicLocale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Site.desktop" });
  return buildMetadata({ title: t("metadataTitle"), description: t("metadataDescription"), path: "/desktop" });
}

export default async function DesktopPage() {
  const t = await getTranslations("Site.desktop");
  const features = [{ key: "models", icon: Layers }, { key: "workspace", icon: Monitor }, { key: "control", icon: ShieldCheck }] as const;
  return (
    <div className="mx-4 px-2 py-12 sm:mx-6 sm:px-0 sm:py-16 lg:mx-8 xl:mx-10 2xl:mx-auto 2xl:max-w-[1460px]">
      <section className="max-w-4xl space-y-7">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2 font-medium"><Monitor className="size-4" aria-hidden="true" />{t("label")}</span>
          <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">{t("status")}</span>
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">{t("title")}</h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{t("description")}</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg"><Link href="/models">{t("exploreModels")}<ArrowRight aria-hidden="true" /></Link></Button>
          <Button asChild variant="outline" size="lg"><a href="https://github.com/phaseoteam/Phaseo" target="_blank" rel="noopener noreferrer"><GitBranch aria-hidden="true" />{t("followDevelopment")}</a></Button>
        </div>
      </section>
      <Separator className="my-12 sm:my-16" />
      <section aria-label={t("label")} className="grid gap-8 md:grid-cols-3 md:gap-12">
        {features.map(({ key, icon: Icon }) => <div key={key} className="space-y-3">
          <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold tracking-tight">{t(`features.${key}.title`)}</h2>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">{t(`features.${key}.description`)}</p>
        </div>)}
      </section>
      <Separator className="my-12 sm:my-16" />
      <section className="max-w-2xl space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">{t("availabilityTitle")}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{t("availabilityDescription")}</p>
      </section>
    </div>
  );
}
