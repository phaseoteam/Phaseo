"use client";

import { CommandItem } from "@/components/ui/command";
import { Logo } from "@/components/Logo";
import { ArrowUpRight } from "lucide-react";

interface SearchRowItemProps {
    id: string;
    title: string;
    subtitle?: string | null;
    href: string;
    logoId?: string;
    flagIso?: string;
    keywords: string[];
    onSelect: (href: string) => void;
}

export function SearchRowItem({
    id,
    title,
    subtitle,
    href,
    logoId,
    flagIso,
    keywords,
    onSelect,
}: SearchRowItemProps) {
    return (
        <CommandItem
            key={id}
            value={href}
            keywords={keywords}
            onSelect={() => onSelect(href)}
            className="flex items-center gap-3 px-3 py-2.5 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800"
        >
            <SearchRowIcon logoId={logoId} flagIso={flagIso} title={title} />
            <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
                    {title}
                </span>
                {subtitle && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                        {subtitle}
                    </span>
                )}
            </div>
            <ArrowUpRight className="size-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
        </CommandItem>
    );
}

function SearchRowIcon({
    logoId,
    flagIso,
    title,
}: {
    logoId?: string;
    flagIso?: string;
    title: string;
}) {
    // Country flag
    if (flagIso) {
        return (
            <div className="size-[18px] shrink-0 rounded-full overflow-hidden">
                <img
                    src={`/flags/${flagIso}.svg`}
                    alt={title}
                    className="h-full w-full object-cover"
                />
            </div>
        );
    }

    // Organization/Provider logo
    if (logoId) {
        return (
            <div className="size-[18px] shrink-0 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <Logo
                    id={logoId}
                    alt={title}
                    width={18}
                    height={18}
                    className="h-[18px] w-[18px] object-contain"
                    fallback={
                        <div className="size-[18px] rounded-full bg-zinc-200 dark:bg-zinc-700" />
                    }
                />
            </div>
        );
    }

    // Fallback placeholder
    return <div className="size-[18px] shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700" />;
}
