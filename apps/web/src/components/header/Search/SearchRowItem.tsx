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
    leftLogoId?: string;
    rightLogoId?: string;
    keywords: string[];
    onSelect: (href: string) => void;
    type?: 'benchmark' | 'comparison' | 'default';
}

export function SearchRowItem({
    id,
    title,
    subtitle,
    href,
    logoId,
    flagIso,
    leftLogoId,
    rightLogoId,
    keywords,
    onSelect,
    type = 'default',
}: SearchRowItemProps) {
    return (
        <CommandItem
            key={id}
            value={href}
            keywords={keywords}
            onSelect={() => onSelect(href)}
            className="flex items-center gap-3 px-3 py-2.5 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800"
        >
            <SearchRowIcon
                logoId={logoId}
                flagIso={flagIso}
                leftLogoId={leftLogoId}
                rightLogoId={rightLogoId}
                title={title}
                type={type}
            />
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
    leftLogoId,
    rightLogoId,
    title,
    type = 'default',
}: {
    logoId?: string;
    flagIso?: string;
    leftLogoId?: string;
    rightLogoId?: string;
    title: string;
    type?: 'benchmark' | 'comparison' | 'default';
}) {
    // Benchmarks: no icon
    if (type === 'benchmark') {
        return null;
    }

    // Comparisons: two logos side by side
    if (type === 'comparison' && leftLogoId && rightLogoId) {
        return (
            <div className="flex items-center gap-1.5 shrink-0">
                <div className="w-6 h-6 relative flex items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-800">
                    <div className="w-4 h-4 relative">
                        <Logo
                            id={leftLogoId}
                            alt={`${leftLogoId} logo`}
                            className="object-contain"
                            fill
                        />
                    </div>
                </div>
                <div className="w-6 h-6 relative flex items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-800">
                    <div className="w-4 h-4 relative">
                        <Logo
                            id={rightLogoId}
                            alt={`${rightLogoId} logo`}
                            className="object-contain"
                            fill
                        />
                    </div>
                </div>
            </div>
        );
    }

    // Country flag (gentle rounding with 4:3 aspect ratio)
    if (flagIso) {
        return (
            <div className="h-6 aspect-4/3 relative flex items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <img
                    src={`/flags/${flagIso}.svg`}
                    alt={title}
                    className="h-full w-full object-cover rounded-sm"
                />
            </div>
        );
    }

    // Organization/Provider/Model logo (rounded square like ModelCard)
    if (logoId) {
        return (
            <div className="w-6 h-6 relative flex items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-800">
                <div className="w-4 h-4 relative">
                    <Logo
                        id={logoId}
                        alt={title}
                        className="object-contain"
                        fill
                    />
                </div>
            </div>
        );
    }

    // Fallback placeholder (used for items without logos)
    return <div className="size-6 shrink-0 rounded-md bg-zinc-200 dark:bg-zinc-700" />;
}
