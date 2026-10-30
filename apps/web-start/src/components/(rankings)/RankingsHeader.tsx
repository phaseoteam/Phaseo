// components/(rankings)/RankingsHeader.tsx
// Purpose: Header component for rankings page
// Why: Provides title, description, and context for the page
// How: Simple presentational component

import { Trophy } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function RankingsHeader() {
    const t = await getTranslations("Catalogue.rankings");
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                    <Trophy className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold">{t("title")}</h1>
                    <p className="text-muted-foreground">
                        {t("realTimeUsage")}
                    </p>
                </div>
            </div>
            <p className="text-sm text-muted-foreground">
                {t("privacyNote")}
            </p>
        </div>
    );
}
