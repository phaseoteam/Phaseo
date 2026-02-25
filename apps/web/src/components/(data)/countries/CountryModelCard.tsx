import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ModelCard as ModelCardType } from "@/lib/fetchers/models/getAllModels";
import { Logo } from "@/components/Logo";
import { formatCountryDate } from "@/components/(data)/countries/utils";

interface CountryModelCardProps {
    model: ModelCardType;
    variant?: "default" | "compact";
    showDatePill?: boolean;
}

export function CountryModelCard({
    model,
    variant = "default",
    showDatePill = true,
}: CountryModelCardProps) {
    const modelSlug = model.model_id;
    const releaseDate = formatCountryDate(model.primary_date);
    const accentColour = model.organisation_colour;
    const accentBorder = accentColour ?? "rgba(59,130,246,0.9)";

    if (variant === "compact") {
        return (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200/70 bg-white/80 px-3 py-2 shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800/70 dark:bg-zinc-900/80">
                <div className="flex items-center gap-3 min-w-0">
                    <Link
                        href={`/organisations/${model.organisation_id}`}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                    >
                        <Logo
                            id={model.organisation_id}
                            alt={model.organisation_name ?? "Provider logo"}
                            width={24}
                            height={24}
                            className="object-contain"
                        />
                    </Link>
                    <div className="min-w-0">
                        <Link
                            href={`/models/${modelSlug}`}
                            className="block truncate text-sm font-semibold leading-tight text-zinc-950 hover:text-primary dark:text-zinc-50"
                        >
                            <span className="relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
                                {model.name}
                            </span>
                        </Link>
                        <p className="text-[0.7rem] uppercase tracking-[0.28em] text-muted-foreground">
                            {showDatePill ? (
                                releaseDate
                            ) : (
                                <Link
                                    href={`/organisations/${model.organisation_id}`}
                                    className="hover:text-primary"
                                >
                                    <span className="relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
                                        {model.organisation_name ??
                                            "Unknown organisation"}
                                    </span>
                                </Link>
                            )}
                        </p>
                    </div>
                </div>
                <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="group h-8 w-8 shrink-0 rounded-full"
                    tabIndex={-1}
                    aria-label={`View ${model.name}`}
                    style={{
                        "--provider-color": accentBorder,
                    } as React.CSSProperties}
                >
                    <Link href={`/models/${modelSlug}`} tabIndex={-1}>
                        <ArrowRight className="h-4 w-4 transition-colors group-hover:text-[var(--provider-color)]" />
                    </Link>
                </Button>
            </div>
        );
    }

    return (
        <Card
            className={cn(
                "relative w-full overflow-hidden border border-zinc-200/80 bg-white text-[0.9rem] shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800/80 dark:bg-zinc-950",
                model.organisation_colour && "border-2"
            )}
            style={{
                borderColor: model.organisation_colour ?? undefined,
                boxShadow: "none",
            }}
        >
            <CardContent className="relative flex flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                    <Link
                        href={`/organisations/${model.organisation_id}`}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                    >
                        <Logo
                            id={model.organisation_id}
                            alt={model.organisation_name ?? "Provider logo"}
                            width={30}
                            height={30}
                            className="object-contain"
                        />
                    </Link>
                    <div className="min-w-0 flex-1">
                        <Link
                            href={`/models/${modelSlug}`}
                            className="block truncate font-semibold leading-tight text-zinc-950 hover:text-primary dark:text-zinc-50"
                        >
                            <span className="relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
                                {model.name}
                            </span>
                        </Link>
                        <p className="text-xs text-muted-foreground">
                            <Link
                                href={`/organisations/${model.organisation_id}`}
                                className="hover:text-primary"
                            >
                                <span className="relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
                                    {model.organisation_name ??
                                        "Unknown organisation"}
                                </span>
                            </Link>
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {showDatePill && (
                            <span className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
                                {releaseDate}
                            </span>
                        )}
                        <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="group h-8 w-8"
                            tabIndex={-1}
                            style={{
                                "--provider-color": accentBorder,
                            } as React.CSSProperties}
                        >
                            <Link href={`/models/${modelSlug}`} tabIndex={-1}>
                                <ArrowRight className="h-4 w-4 transition-colors group-hover:text-[var(--provider-color)]" />
                            </Link>
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
